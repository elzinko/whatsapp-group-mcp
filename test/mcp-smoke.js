// Test de fumée : démarre le serveur, fait le handshake MCP, liste les outils
// et appelle whatsapp_status. Ne nécessite AUCUN appairage WhatsApp.
// Vérifie que la couche MCP (stdio/JSON-RPC) fonctionne de bout en bout.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(__dirname, "..", "src", "index.js");

const transport = new StdioClientTransport({
  command: process.execPath, // node
  args: [serverEntry],
  stderr: "inherit", // laisse passer logs + QR du serveur
  env: {
    ...process.env,
    // Empêche toute vraie connexion d'interférer : dossier auth jetable + groupe factice
    WHATSAPP_AUTH_DIR: "./auth-test",
    WHATSAPP_GROUP_ID: process.env.WHATSAPP_GROUP_ID || "0000000000000@g.us",
    WHATSAPP_GROUP_NAME: "",
    WHATSAPP_PERSIST: "false", // pas d'écriture disque pendant le test de fumée
  },
});

const client = new Client({ name: "smoke-test", version: "0.0.0" }, { capabilities: {} });

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

try {
  await client.connect(transport);
  console.log("--- Handshake MCP réussi ---");

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  console.log("Outils exposés :", names.join(", "));
  for (const expected of [
    "whatsapp_status",
    "list_groups",
    "get_recent_messages",
    "send_message",
  ]) {
    check(`outil présent: ${expected}`, names.includes(expected));
  }

  const statusRes = await client.callTool({ name: "whatsapp_status", arguments: {} });
  const statusText = statusRes.content?.[0]?.text || "";
  console.log("--- whatsapp_status ---");
  console.log(statusText);
  const status = JSON.parse(statusText);
  check("status a un champ 'state'", typeof status.state === "string");
  check("status.groupConfigured === true (groupe factice fourni)", status.groupConfigured === true);

  // get_recent_messages doit répondre proprement même sans connexion
  const recentRes = await client.callTool({
    name: "get_recent_messages",
    arguments: { limit: 5 },
  });
  const recent = JSON.parse(recentRes.content?.[0]?.text || "{}");
  check("get_recent_messages renvoie un objet messages", Array.isArray(recent.messages));

  // send_message doit être refusé (allowSend=false par défaut)
  const sendRes = await client.callTool({
    name: "send_message",
    arguments: { text: "test" },
  });
  check(
    "send_message refusé quand WHATSAPP_ALLOW_SEND=false",
    sendRes.isError === true && /désactivé|WhatsApp non connecté/.test(sendRes.content?.[0]?.text || "")
  );
} catch (e) {
  console.error("Test en échec:", e);
  failed = true;
} finally {
  try {
    await client.close();
  } catch {}
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
