// Tests des canaux autorisés (ADR-0001) :
// - persistance des grants (settings.json) et résistance à un fichier corrompu,
// - LA barrière de sécurité : un message d'un canal non autorisé n'entre jamais,
// - absence de toute capacité d'envoi.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Settings } from "../src/settings.js";
import { Allowlist, parseAllowlist } from "../src/allowlist.js";
import { WhatsAppClient } from "../src/whatsapp.js";

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-grants-"));

const fakeMsg = (jid, id) => ({
  key: { remoteJid: jid, id, participant: "alice@s.whatsapp.net" },
  message: { conversation: "coucou" },
  messageTimestamp: 1700000000,
  pushName: "Alice",
});

try {
  // --- 1) Persistance des grants ---
  const file = path.join(tmp, "settings.json");
  const s1 = new Settings(file);
  check("aucun grant au départ", s1.grants.size === 0);

  s1.grant("111@g.us", "Copro");
  check("le grant est écrit sur disque", fs.existsSync(file));

  const s2 = new Settings(file).load();
  check("grant rechargé après redémarrage", s2.has("111@g.us"));
  check("nom du groupe conservé", s2.list()[0].subject === "Copro");
  check("portée 'read' explicite", s2.list()[0].scope === "read");

  s2.revoke("111@g.us");
  check("la révocation est persistée", new Settings(file).load().grants.size === 0);

  // --- 2) Robustesse : un fichier illisible ne doit pas ouvrir des droits ---
  fs.writeFileSync(file, "{ceci n'est pas du json");
  check("fichier corrompu -> aucun grant (fail closed)", new Settings(file).load().grants.size === 0);

  // Une portée inconnue (écrite par une version future) ne doit pas être honorée.
  fs.writeFileSync(
    file,
    JSON.stringify({ version: 1, grants: [{ jid: "222@g.us", scope: "send" }] })
  );
  check("portée inconnue ignorée", !new Settings(file).load().has("222@g.us"));

  // --- 3) Barrière d'ingestion (grant ET plafond exigés, ADR-0002) ---
  const settings = new Settings(path.join(tmp, "ingest.json"));
  settings.grant("aaa@g.us", "Autorisé");
  // Vrai fichier : le plafond se recharge depuis le disque à chaque décision.
  const ceilingFile = path.join(tmp, "allowlist.json");
  fs.writeFileSync(ceilingFile, JSON.stringify({ version: 1, channels: ["aaa@g.us"] }));
  const ceiling = new Allowlist(ceilingFile).load();
  const wa = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilingFile },
    settings,
    ceiling
  );

  wa._ingest(fakeMsg("aaa@g.us", "m1"));
  wa._ingest(fakeMsg("bbb@g.us", "m2")); // canal NON autorisé
  wa._ingest(fakeMsg("ccc@s.whatsapp.net", "m3")); // discussion privée

  check("message d'un canal autorisé ingéré", wa.stores.get("aaa@g.us")?.size() === 1);
  check("message d'un canal NON autorisé rejeté", !wa.stores.has("bbb@g.us"));
  check("message d'une discussion privée rejeté", !wa.stores.has("ccc@s.whatsapp.net"));

  // Après révocation, plus rien n'entre.
  settings.revoke("aaa@g.us");
  wa._ingest(fakeMsg("aaa@g.us", "m4"));
  check("après révocation, plus d'ingestion", wa.stores.get("aaa@g.us")?.size() === 1);

  // --- 4) Lecture seule ---
  check("le client ne sait pas envoyer", wa.sendMessage === undefined);
  check("status annonce readOnly", wa.status().readOnly === true);
} catch (e) {
  console.error("Erreur test:", e);
  failed = true;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
