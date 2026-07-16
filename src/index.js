#!/usr/bin/env node
// Serveur MCP (stdio) exposant UN SEUL groupe WhatsApp à Claude Desktop.
// Sécurité : toute lecture/écriture est verrouillée sur WHATSAPP_GROUP_ID.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { config } from "./config.js";
import { MessageStore } from "./store.js";
import { WhatsAppClient, log } from "./whatsapp.js";

const store = new MessageStore(config.maxMessages);
const wa = new WhatsAppClient(config, store);

// --- Définition des outils MCP ---
const TOOLS = [
  {
    name: "whatsapp_status",
    description:
      "État de la connexion WhatsApp (connecté ou non, groupe configuré, envoi autorisé, nombre de messages en mémoire). À appeler en premier pour savoir s'il faut scanner le QR code.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_groups",
    description:
      "Liste les groupes WhatsApp dont le compte est membre (id/JID + nom). Sert UNE fois à trouver le JID du groupe à mettre dans WHATSAPP_GROUP_ID. Ne renvoie aucun message.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_recent_messages",
    description:
      "Renvoie les messages récents du SEUL groupe autorisé (WHATSAPP_GROUP_ID), du plus ancien au plus récent. Ne peut pas lire d'autres groupes.",
    inputSchema: {
      type: "object",
      properties: {
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
  {
    name: "send_message",
    description:
      "Envoie un message texte dans le SEUL groupe autorisé. Fonctionne uniquement si WHATSAPP_ALLOW_SEND=true. Ne peut cibler aucun autre destinataire.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", minLength: 1, description: "Le texte à envoyer." },
      },
      required: ["text"],
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
  { name: "whatsapp-group-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    switch (name) {
      case "whatsapp_status":
        return ok(wa.status());

      case "list_groups": {
        const groups = await wa.listGroups();
        return ok({ count: groups.length, groups });
      }

      case "get_recent_messages": {
        if (!wa.groupId) {
          return fail(
            "Aucun groupe défini/résolu. Renseigne WHATSAPP_GROUP_ID ou WHATSAPP_GROUP_NAME dans .env (utilise 'list_groups' pour trouver le JID), puis relance le serveur."
          );
        }
        const limit = Number.isInteger(args.limit) ? args.limit : 50;
        const messages = store.recent(limit).map((m) => ({
          from: m.pushName || m.sender,
          sender: m.sender,
          fromMe: m.fromMe,
          text: m.text,
          at: new Date((m.timestamp || 0) * 1000).toISOString(),
        }));
        return ok({
          groupId: wa.groupId,
          returned: messages.length,
          buffered: store.size(),
          note:
            store.size() === 0
              ? "Aucun message en mémoire pour l'instant. Le tampon se remplit avec l'historique reçu à la connexion et les nouveaux messages."
              : undefined,
          messages,
        });
      }

      case "send_message":
        return ok(await wa.sendMessage(args.text));

      default:
        return fail(`Outil inconnu : ${name}`);
    }
  } catch (err) {
    return fail(err?.message || String(err));
  }
});

async function main() {
  // 1) Démarre WhatsApp (affiche un QR sur stderr si pas encore appairé).
  //    On n'attend pas la connexion : le serveur MCP doit répondre tout de suite.
  wa.start().catch((e) => log("Echec démarrage WhatsApp:", e?.message));

  // 2) Démarre le transport MCP sur stdio.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("Serveur MCP prêt (stdio). Groupe autorisé:", config.groupId || "(non configuré)");
}

main().catch((e) => {
  log("Erreur fatale:", e?.message);
  process.exit(1);
});
