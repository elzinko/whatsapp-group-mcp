// Test de l'outil d'aide `whatsapp_help` (fiche 0011).
// Démarre le serveur, liste les outils, appelle whatsapp_help et vérifie que
// l'aide couvre les invariants clés ET indirige vers le README (sans le recopier).
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-help-"));
const settingsFile = path.join(tmpDir, "settings.json");
const allowlistFile = path.join(tmpDir, "allowlist.json");

const transport = new StdioClientTransport({
  command: process.execPath, // node
  args: [serverEntry],
  stderr: "ignore", // aide statique : ni QR ni logs serveur ne concernent ce test
  env: {
    ...process.env,
    WHATSAPP_AUTH_DIR: "./auth-test",
    WHATSAPP_SETTINGS_FILE: settingsFile,
    WHATSAPP_ALLOWLIST_FILE: allowlistFile,
    WHATSAPP_GROUP_ID: "",
    WHATSAPP_GROUP_NAME: "",
    WHATSAPP_PERSIST: "false",
  },
});

const client = new Client({ name: "help-test", version: "0.0.0" }, { capabilities: {} });

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

try {
  await client.connect(transport);
  console.log("--- Handshake MCP réussi ---");

  // 1) whatsapp_help doit apparaître dans l'inventaire des outils.
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  console.log("Outils exposés :", names.join(", "));
  check("outil présent: whatsapp_help", names.includes("whatsapp_help"));

  // 2) Un appel renvoie une aide concise couvrant les invariants clés.
  const res = await client.callTool({ name: "whatsapp_help", arguments: {} });
  const text = res.content?.[0]?.text || "";
  console.log("--- whatsapp_help ---");
  console.log(text);

  check("l'appel ne renvoie pas d'erreur", res.isError !== true);
  check("mentionne la lecture seule", /lecture seule/i.test(text));
  check("mentionne le plafond", /plafond/i.test(text));
  check("nomme le fichier allowlist.json", /allowlist\.json/.test(text));

  // Les 5 outils doivent être nommés (le modèle mental complet).
  for (const tool of [
    "whatsapp_status",
    "list_groups",
    "grant_channel",
    "revoke_channel",
    "get_recent_messages",
  ]) {
    check(`aide nomme l'outil ${tool}`, text.includes(tool));
  }

  // Flux grant -> lecture, et note de sécurité (auto-grant borné par le plafond).
  check("mentionne le flux grant -> lecture", /grant/i.test(text) && /lecture/i.test(text));
  check(
    "note de sécurité: auto-grant borné par le plafond",
    /(auto-grant|s'auto-grant|lui-même)/i.test(text) && /limite|born|plafond/i.test(text)
  );

  // 3) Indirige vers le README (pointeur), sans le recopier.
  check("pointe vers le README", /README/i.test(text));

  // Concision : l'aide reste courte (indirige, ne recopie pas le README).
  check("aide concise (<= 2500 caractères)", text.length > 0 && text.length <= 2500);
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
