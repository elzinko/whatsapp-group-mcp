// Test de la provenance du consentement exposée dans whatsapp_status (fiche 0008).
// La logique de consentement elle-même (élicitation/Touch ID) est hors périmètre :
// on injecte directement le `via` dans Settings#grant et on vérifie ce que
// WhatsAppClient#status() en dérive (consentVia / confirmedByHuman).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Settings } from "../src/settings.js";
import { Allowlist } from "../src/allowlist.js";
import { WhatsAppClient } from "../src/whatsapp.js";

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-consent-provenance-"));

try {
  const settingsFile = path.join(tmp, "settings.json");
  const ceilingFile = path.join(tmp, "allowlist.json");
  fs.writeFileSync(
    ceilingFile,
    JSON.stringify({ version: 1, channels: ["aaa@g.us", "bbb@g.us", "ccc@g.us", "ddd@g.us"] })
  );

  const settings = new Settings(settingsFile);
  const ceiling = new Allowlist(ceilingFile).load();
  const wa = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilingFile },
    settings,
    ceiling
  );

  settings.grant("aaa@g.us", "Confirmé élicitation", "elicitation");
  settings.grant("ddd@g.us", "Confirmé Touch ID", "touchid");
  settings.grant("bbb@g.us", "Auto-accordé", "client-permissions");
  settings.grant("ccc@g.us", "Legacy sans via");

  const byJid = Object.fromEntries(wa.status().grantedChannels.map((g) => [g.jid, g]));

  check(
    "via='elicitation' -> consentVia='elicitation' et confirmedByHuman=true",
    byJid["aaa@g.us"].consentVia === "elicitation" && byJid["aaa@g.us"].confirmedByHuman === true
  );
  check(
    "via='touchid' -> consentVia='touchid' et confirmedByHuman=true",
    byJid["ddd@g.us"].consentVia === "touchid" && byJid["ddd@g.us"].confirmedByHuman === true
  );
  check(
    "via='client-permissions' -> confirmedByHuman=false (auto-accordé, pas d'humain)",
    byJid["bbb@g.us"].consentVia === "client-permissions" && byJid["bbb@g.us"].confirmedByHuman === false
  );
  check(
    "grant legacy (via=null) -> confirmedByHuman=null (provenance inconnue)",
    byJid["ccc@g.us"].consentVia === null && byJid["ccc@g.us"].confirmedByHuman === null
  );
} catch (e) {
  console.error("Erreur test:", e);
  failed = true;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
