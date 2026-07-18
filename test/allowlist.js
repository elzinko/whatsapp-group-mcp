// Tests du PLAFOND (ADR-0002) :
// - parsing et fail closed (fichier absent/corrompu = plafond vide),
// - correspondance par JID et par nom (insensible à la casse),
// - migration au premier démarrage (généré depuis les grants existants),
// - le plafond borne l'ingestion et la lecture (grant suspendu s'il en sort),
// - le grant exige plafond ET consentement humain (contrat confirmGrant).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Allowlist, parseAllowlist, allowlistPermits } from "../src/allowlist.js";
import { Settings } from "../src/settings.js";
import { WhatsAppClient } from "../src/whatsapp.js";

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}
async function expectThrow(label, fn, pattern) {
  try {
    await fn();
    check(`${label} (aurait dû refuser)`, false);
  } catch (e) {
    check(label, pattern.test(e?.message || ""));
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-allowlist-"));

const fakeMsg = (jid, id) => ({
  key: { remoteJid: jid, id, participant: "alice@s.whatsapp.net" },
  message: { conversation: "coucou" },
  messageTimestamp: 1700000000,
  pushName: "Alice",
});

// Un client « prêt » sans réseau : faux socket qui renvoie un snapshot de groupes.
function readyClient(config, settings, allowlist, groups) {
  const wa = new WhatsAppClient(config, settings, allowlist);
  wa.state = "open";
  wa.sock = {
    groupFetchAllParticipating: async () =>
      Object.fromEntries(groups.map((g) => [g.id, { id: g.id, subject: g.subject, participants: [] }])),
  };
  return wa;
}

try {
  // --- 1) Parsing : chaînes (nom ou JID) et objets, entrées invalides ignorées ---
  const entries = parseAllowlist({
    channels: ["Copro Reine Blanche", "111@g.us", { jid: "222@g.us", name: "Basket" }, "", 42, {}],
  });
  check("parse : 3 entrées valides retenues", entries.length === 3);
  check("parse : chaîne JID reconnue comme jid", entries[1].jid === "111@g.us");
  check("parse : chaîne non-JID reconnue comme nom", entries[0].name === "Copro Reine Blanche");

  // --- 2) Correspondance ---
  check("permits par JID exact", allowlistPermits(entries, "222@g.us", null) === true);
  check(
    "permits par nom, insensible à la casse",
    allowlistPermits(entries, "999@g.us", "copro reine blanche") === true
  );
  check("hors plafond -> refus", allowlistPermits(entries, "999@g.us", "Famille") === false);

  // --- 3) Fail closed ---
  const missing = new Allowlist(path.join(tmp, "absent.json")).load();
  check("fichier absent -> plafond vide", missing.entries.length === 0 && !missing.permits("1@g.us", "x"));
  const corruptFile = path.join(tmp, "corrompu.json");
  fs.writeFileSync(corruptFile, "{pas du json");
  check("fichier corrompu -> plafond vide", new Allowlist(corruptFile).load().entries.length === 0);

  // --- 4) Migration au premier démarrage ---
  const s = new Settings(path.join(tmp, "settings.json"));
  s.grant("aaa@g.us", "Copro");
  const migrated = new Allowlist(path.join(tmp, "allowlist.json")).bootstrap(s);
  check("bootstrap : fichier créé depuis les grants", fs.existsSync(path.join(tmp, "allowlist.json")));
  check("bootstrap : le grant existant est au plafond", migrated.permits("aaa@g.us", "Copro"));
  // Un second bootstrap ne réécrit pas le fichier (l'humain fait foi ensuite).
  fs.writeFileSync(path.join(tmp, "allowlist.json"), JSON.stringify({ version: 1, channels: [] }));
  const second = new Allowlist(path.join(tmp, "allowlist.json")).bootstrap(s);
  check("bootstrap : jamais deux fois (l'édition manuelle fait foi)", second.entries.length === 0);

  // --- 5) Le plafond borne l'ingestion ---
  const s2 = new Settings(path.join(tmp, "s2.json"));
  s2.grant("in@g.us", "Dedans");
  s2.grant("out@g.us", "Dehors"); // granté mais PAS au plafond
  const ceiling = new Allowlist(path.join(tmp, "c2.json"));
  ceiling.entries = parseAllowlist({ channels: ["in@g.us"] });
  const wa = new WhatsAppClient({ maxMessages: 10, persist: false, allowlistFile: "c2.json" }, s2, ceiling);
  wa._ingest(fakeMsg("in@g.us", "m1"));
  wa._ingest(fakeMsg("out@g.us", "m2"));
  check("granté + plafond -> ingéré", wa.stores.get("in@g.us")?.size() === 1);
  check("granté mais HORS plafond -> rejeté (suspendu)", !wa.stores.has("out@g.us"));

  // --- 6) La lecture d'un canal suspendu est refusée avec un message explicite ---
  await expectThrow(
    "recentFor d'un canal suspendu -> erreur « suspendu »",
    () => wa.recentFor("out@g.us", 5),
    /suspendu/i
  );

  // --- 7) grantChannel : hors plafond -> refus, même connecté ---
  const s3 = new Settings(path.join(tmp, "s3.json"));
  const c3 = new Allowlist(path.join(tmp, "c3.json")); // plafond vide, pas de fichier
  const wa3 = readyClient(
    { maxMessages: 10, persist: false, allowlistFile: path.join(tmp, "c3.json") },
    s3,
    c3,
    [{ id: "g1@g.us", subject: "Copro" }]
  );
  await expectThrow(
    "grant hors plafond -> refus mentionnant l'édition manuelle",
    () => wa3.grantChannel("Copro"),
    /hors du plafond/i
  );

  // --- 8) grantChannel : au plafond, le consentement humain tranche ---
  fs.writeFileSync(path.join(tmp, "c3.json"), JSON.stringify({ version: 1, channels: ["Copro"] }));
  wa3.confirmGrant = async () => ({ accepted: false, reason: "test de refus" });
  await expectThrow(
    "consentement refusé -> pas de grant",
    () => wa3.grantChannel("Copro"),
    /refusée par l'humain/i
  );
  check("après refus, aucun grant écrit", !s3.has("g1@g.us"));

  wa3.confirmGrant = async ({ jid, subject }) => ({ accepted: jid === "g1@g.us" && subject === "Copro" });
  const res = await wa3.grantChannel("Copro");
  check("consentement accordé -> grant écrit", res.granted === true && s3.has("g1@g.us"));
} catch (e) {
  console.error("Erreur test:", e);
  failed = true;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
