#!/usr/bin/env node
// [SPIKE] Serveur MCP stdio AUTONOME et RETIRABLE, dédié à une seule question de
// faisabilité : un serveur MCP stdio spawné par un client (Claude Code, etc.) peut-il
// AFFICHER la boîte système Touch ID ?
//
// Ne touche PAS au serveur de production (src/index.js) : ce fichier est un jetable,
// à enregistrer temporairement dans un client MCP puis à désenregistrer une fois le
// relevé fait. Le verdict est HUMAIN — cette sonde ne fait qu'exposer l'appel, elle
// ne peut ni simuler ni observer le doigt de l'utilisateur.
//
// stdout est réservé au JSON-RPC MCP : tout log va sur stderr.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { checkPresence } from "../src/touchid.js";

function log(...args) {
  console.error("[touchid-probe]", ...args);
}

const server = new Server(
  { name: "touchid-probe", version: "0.0.1-spike" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "touchid_probe",
    description:
      "[SPIKE] Déclenche une vérification de présence via Touch ID/Watch/mot de passe " +
      "de session (LocalAuthentication). Sert UNIQUEMENT à constater, à l'oeil humain, " +
      "si la boîte système s'affiche quand ce serveur MCP stdio est spawné par un " +
      "client comme Claude Code. Ne remplace aucun contrôle d'accès réel.",
    inputSchema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Texte affiché dans la boîte Touch ID (optionnel).",
        },
      },
      additionalProperties: false,
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  if (name !== "touchid_probe") {
    return {
      isError: true,
      content: [{ type: "text", text: `Outil inconnu : ${name}` }],
    };
  }

  const reason = args.reason || "[SPIKE] vérifier Touch ID depuis un serveur MCP stdio";
  log("Appel touchid_probe, reason:", reason);
  const result = await checkPresence({ reason });
  log("Résultat:", JSON.stringify(result));

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("Sonde Touch ID prête (stdio). En attente d'un appel touchid_probe.");
}

main().catch((e) => {
  log("Erreur fatale:", e?.message);
  process.exit(1);
});
