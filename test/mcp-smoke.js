// Test de fumée : démarre le serveur, fait le handshake MCP, liste les outils,
// appelle whatsapp_status et vérifie le comportement sans canal autorisé.
// Ne nécessite AUCUN appairage WhatsApp.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(__dirname, "..", "src", "index.js");

// Réglages jetables : on ne touche ni au settings.json ni au allowlist.json réels.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-smoke-"));
const settingsFile = path.join(tmpDir, "settings.json");
const allowlistFile = path.join(tmpDir, "allowlist.json");

const transport = new StdioClientTransport({
  command: process.execPath, // node
  args: [serverEntry],
  stderr: "inherit", // laisse passer logs + QR du serveur
  env: {
    ...process.env,
    // Empêche toute vraie connexion d'interférer : dossier auth jetable, réglages jetables
    WHATSAPP_AUTH_DIR: "./auth-test",
    WHATSAPP_SETTINGS_FILE: settingsFile,
    WHATSAPP_ALLOWLIST_FILE: allowlistFile,
    WHATSAPP_GROUP_ID: "",
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
    "grant_channel",
    "revoke_channel",
    "get_recent_messages",
  ]) {
    check(`outil présent: ${expected}`, names.includes(expected));
  }

  // Lecture seule : l'outil d'envoi ne doit pas exister du tout, pas être "désactivé".
  check("AUCUN outil d'envoi exposé", !names.some((n) => /send|envoi/i.test(n)));

  const statusRes = await client.callTool({ name: "whatsapp_status", arguments: {} });
  const statusText = statusRes.content?.[0]?.text || "";
  console.log("--- whatsapp_status ---");
  console.log(statusText);
  const status = JSON.parse(statusText);
  check("status a un champ 'state'", typeof status.state === "string");
  check("status.readOnly === true", status.readOnly === true);
  check("aucun canal autorisé au départ", Array.isArray(status.grantedChannels) && status.grantedChannels.length === 0);

  // Sans canal autorisé, la lecture échoue proprement et explique quoi faire.
  const recentRes = await client.callTool({
    name: "get_recent_messages",
    arguments: { limit: 5 },
  });
  check(
    "get_recent_messages sans grant -> erreur explicite",
    recentRes.isError === true && /Aucun canal autorisé/.test(recentRes.content?.[0]?.text || "")
  );

  // grant_channel sans connexion WhatsApp doit échouer proprement (pas de crash).
  const grantRes = await client.callTool({
    name: "grant_channel",
    arguments: { channel: "0000000000000@g.us" },
  });
  check(
    "grant_channel hors connexion -> erreur explicite",
    grantRes.isError === true && /non connecté/i.test(grantRes.content?.[0]?.text || "")
  );
} catch (e) {
  console.error("Test en échec:", e);
  failed = true;
} finally {
  try {
    await client.close();
  } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
