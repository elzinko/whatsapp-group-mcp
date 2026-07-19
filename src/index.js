#!/usr/bin/env node
// Serveur MCP (stdio) exposant en LECTURE SEULE les groupes WhatsApp explicitement
// autorisés. Voir docs/adr/0001-modele-d-acces-aux-canaux.md
//
// Deux barrières :
//   1. l'ingestion ne retient que les canaux autorisés (whatsapp.js#_ingest) ;
//   2. les outils ne lisent que dans ces mêmes canaux.
// Il n'existe aucun outil d'envoi : ce serveur ne peut pas écrire sur WhatsApp.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { config } from "./config.js";
import { Settings } from "./settings.js";
import { Allowlist } from "./allowlist.js";
import { buildConfirmGrant } from "./consent.js";
import { WhatsAppClient, log } from "./whatsapp.js";

const settings = new Settings(config.settingsFile).load();
// Le plafond (ADR-0002). Au tout premier démarrage, il est généré depuis les grants
// existants (migration sans régression) ; ensuite seul l'humain l'édite, à la main.
const allowlist = new Allowlist(config.allowlistFile).bootstrap(settings);
const wa = new WhatsAppClient(config, settings, allowlist);

// --- Définition des outils MCP ---
const TOOLS = [
  {
    name: "whatsapp_status",
    description:
      "État de la connexion WhatsApp, canaux autorisés en lecture, messages en mémoire. À appeler en premier pour savoir s'il faut scanner le QR code ou autoriser un canal.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_groups",
    description:
      "Liste les groupes WhatsApp dont le compte est membre (id/JID, nom, et s'ils sont déjà autorisés). C'est le menu : à utiliser pour choisir un canal à autoriser. Ne renvoie aucun message.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "grant_channel",
    description:
      "Autorise la LECTURE d'un groupe, de façon persistante (survit aux redémarrages). Borné par le plafond (allowlist.json, édité à la main par l'humain — hors plafond, refus systématique) et soumis au consentement de l'humain (formulaire d'élicitation si le client le supporte). N'accorde jamais le droit d'écrire : ce serveur ne peut pas envoyer de message. Utilise 'list_groups' avant pour connaître les noms/JID exacts et le champ 'inAllowlist'.",
    inputSchema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          minLength: 1,
          description: "JID du groupe (…@g.us) ou son nom exact.",
        },
      },
      required: ["channel"],
      additionalProperties: false,
    },
  },
  {
    name: "revoke_channel",
    description:
      "Retire l'autorisation de lecture d'un groupe. Les messages déjà archivés sur disque ne sont pas supprimés.",
    inputSchema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          minLength: 1,
          description: "JID du groupe (…@g.us) ou son nom exact.",
        },
      },
      required: ["channel"],
      additionalProperties: false,
    },
  },
  {
    name: "get_recent_messages",
    description:
      "Messages récents d'UN canal autorisé, du plus ancien au plus récent. Si un seul canal est autorisé, 'channel' est optionnel. Pour analyser plusieurs canaux, appeler cet outil une fois par canal.",
    inputSchema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          description: "JID (…@g.us) ou nom exact. Optionnel si un seul canal est autorisé.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Nombre max de messages à renvoyer (défaut 50).",
        },
      },
      additionalProperties: false,
    },
  },
];

function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function fail(message) {
  return { content: [{ type: "text", text: `Erreur : ${message}` }], isError: true };
}

const server = new Server(
  { name: "whatsapp-group-mcp", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    switch (name) {
      case "whatsapp_status":
        return ok({
          ...wa.status(),
          grantConsent: clientSupportsElicitation
            ? "élicitation (formulaire rédigé par le serveur, hors de portée du LLM)"
            : "permissions du client MCP (le client ne supporte pas l'élicitation)",
        });

      case "list_groups": {
        const groups = await wa.listGroups();
        return ok({ count: groups.length, groups });
      }

      case "grant_channel":
        return ok(await wa.grantChannel(args.channel));

      case "revoke_channel":
        return ok(wa.revokeChannel(args.channel));

      case "get_recent_messages": {
        const limit = Number.isInteger(args.limit) ? args.limit : 50;
        const { jid, subject, messages, buffered } = wa.recentFor(args.channel, limit);
        return ok({
          channel: { jid, subject },
          returned: messages.length,
          buffered,
          note:
            messages.length === 0
              ? "Aucun message en mémoire pour ce canal. Le tampon se remplit avec l'historique reçu à la connexion et les nouveaux messages."
              : undefined,
          messages: messages.map((m) => ({
            from: m.pushName || m.sender,
            sender: m.sender,
            fromMe: m.fromMe,
            text: m.text,
            at: new Date((m.timestamp || 0) * 1000).toISOString(),
          })),
        });
      }

      default:
        return fail(`Outil inconnu : ${name}`);
    }
  } catch (err) {
    return fail(err?.message || String(err));
  }
});

// L'élicitation est la seule façon d'afficher à l'humain une question RÉDIGÉE PAR LE
// SERVEUR, dont la réponse ne transite jamais par le LLM (ADR-0001, ADR-0002). Quand le
// client la supporte, chaque grant passe par ce consentement. Sinon, repli : le grant
// reste borné par le plafond, et la confirmation d'appel d'outil du client (quand elle
// existe) reste le garde-fou conversationnel.
let clientSupportsElicitation = false;

server.oninitialized = () => {
  const caps = server.getClientCapabilities() || {};
  clientSupportsElicitation = !!caps.elicitation;
  log("Client MCP connecté. Capabilities:", JSON.stringify(caps));
  log("Elicitation supportée par ce client :", clientSupportsElicitation ? "OUI" : "non");
};

wa.confirmGrant = buildConfirmGrant(server, () => clientSupportsElicitation, log);

async function main() {
  // 1) Démarre WhatsApp (affiche un QR sur stderr si pas encore appairé).
  //    On n'attend pas la connexion : le serveur MCP doit répondre tout de suite.
  wa.start().catch((e) => log("Echec démarrage WhatsApp:", e?.message));

  // 2) Démarre le transport MCP sur stdio.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const granted = settings.list();
  log(
    "Serveur MCP prêt (stdio, LECTURE SEULE). Canaux autorisés:",
    granted.length ? granted.map((g) => g.subject || g.jid).join(", ") : "(aucun)"
  );
}

main().catch((e) => {
  log("Erreur fatale:", e?.message);
  process.exit(1);
});
