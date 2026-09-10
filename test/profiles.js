// Tests du PROFIL (fiche 0004, ADR-0006) : seconde borne, au même point que le
// plafond. _inScope(jid) = _ceilingHas(jid) ET _profileHas(jid).
//
// - parsing (réutilise le parseur du plafond) et fail closed,
// - intersection avec le plafond (le cœur de la fiche),
// - opt-in : sans profiles.json ni WHATSAPP_PROFILE -> couche inerte (ADR-0002),
// - fail closed dès que la couche est active : profil non déclaré/inconnu -> rien,
// - même profil (même contenu, chemins différents) -> même périmètre,
// - rechargement à chaud.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Profiles } from "../src/profiles.js";
import { Allowlist } from "../src/allowlist.js";
import { Settings } from "../src/settings.js";
import { WhatsAppClient } from "../src/whatsapp.js";

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-profiles-"));

const fakeMsg = (jid, id) => ({
  key: { remoteJid: jid, id, participant: "alice@s.whatsapp.net" },
  message: { conversation: "coucou" },
  messageTimestamp: 1700000000,
  pushName: "Alice",
});

try {
  // --- 1) Parsing : profiles.json peuple byName, exists===true ---
  const profFile1 = path.join(tmp, "profiles1.json");
  fs.writeFileSync(
    profFile1,
    JSON.stringify({
      version: 1,
      profiles: {
        copro: ["111@g.us", { jid: "222@g.us" }],
        famille: ["333@g.us"],
      },
    })
  );
  const p1 = new Profiles(profFile1).load();
  check("parsing : exists === true", p1.exists === true);
  check("parsing : byName peuplé (copro + famille)", p1.byName.size === 2);
  check("parsing : copro permet 111@g.us", p1.permits("copro", "111@g.us", null) === true);
  check("parsing : famille permet 333@g.us", p1.permits("famille", "333@g.us", null) === true);

  // --- 2) Fail closed fichier : absent / corrompu ---
  const missing = new Profiles(path.join(tmp, "absent.json")).load();
  check("fichier absent -> exists===false", missing.exists === false);
  check("fichier absent -> permits false", missing.permits("copro", "111@g.us", null) === false);

  const corruptFile = path.join(tmp, "corrompu.json");
  fs.writeFileSync(corruptFile, "{pas du json");
  const corrupt = new Profiles(corruptFile).load();
  check("fichier corrompu -> byName vide", corrupt.byName.size === 0);
  check("fichier corrompu -> permits false", corrupt.permits("copro", "111@g.us", null) === false);

  // --- 3) Intersection (cœur) : plafond {111,222,333}, profil copro:[111,222] ---
  const ceilingFile = path.join(tmp, "ceiling3.json");
  fs.writeFileSync(
    ceilingFile,
    JSON.stringify({ version: 1, channels: ["111@g.us", "222@g.us", "333@g.us"] })
  );
  const profFile3 = path.join(tmp, "profiles3.json");
  fs.writeFileSync(
    profFile3,
    JSON.stringify({ version: 1, profiles: { copro: ["111@g.us", "222@g.us"] } })
  );
  const settings3 = new Settings(path.join(tmp, "settings3.json"));
  const wa3 = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilingFile, profile: "copro" },
    settings3,
    new Allowlist(ceilingFile).load(),
    new Profiles(profFile3).load()
  );
  check("intersection : 111 (plafond+profil) -> inScope", wa3._inScope("111@g.us") === true);
  check("intersection : 333 (plafond seul, hors profil) -> hors scope", wa3._inScope("333@g.us") === false);

  // Canal du profil MAIS hors plafond -> hors scope.
  const profFile3b = path.join(tmp, "profiles3b.json");
  fs.writeFileSync(
    profFile3b,
    JSON.stringify({ version: 1, profiles: { copro: ["999@g.us"] } })
  );
  const wa3b = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilingFile, profile: "copro" },
    new Settings(path.join(tmp, "settings3b.json")),
    new Allowlist(ceilingFile).load(),
    new Profiles(profFile3b).load()
  );
  check("intersection : canal du profil mais hors plafond -> hors scope", wa3b._inScope("999@g.us") === false);

  // Effet : _ingest sur 333 (hors profil) -> non stocké.
  settings3.grant("333@g.us", "Hors profil");
  wa3._ingest(fakeMsg("333@g.us", "m1"));
  check("_ingest sur canal hors profil -> non stocké", !wa3.stores.has("333@g.us"));

  // --- 4) Sans profil déclaré alors que profils actifs (profiles.json présent) ---
  const wa4 = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilingFile, profile: "" },
    new Settings(path.join(tmp, "settings4.json")),
    new Allowlist(ceilingFile).load(),
    new Profiles(profFile3).load()
  );
  check("profils actifs, process non déclaré -> 111 hors scope", wa4._inScope("111@g.us") === false);
  check("profils actifs, process non déclaré -> 222 hors scope", wa4._inScope("222@g.us") === false);
  check("profils actifs, process non déclaré -> 333 hors scope", wa4._inScope("333@g.us") === false);
  wa4.state = "open";
  wa4.sock = {
    groupFetchAllParticipating: async () =>
      Object.fromEntries(
        ["111@g.us", "222@g.us", "333@g.us"].map((jid) => [jid, { id: jid, subject: "X", participants: [] }])
      ),
  };
  const menu4 = await wa4.listGroups();
  check("profils actifs, process non déclaré -> listGroups vide", menu4.groups.length === 0);

  // --- 5) Profil inconnu (config.profile="ghost") ---
  const wa5 = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilingFile, profile: "ghost" },
    new Settings(path.join(tmp, "settings5.json")),
    new Allowlist(ceilingFile).load(),
    new Profiles(profFile3).load()
  );
  check("profil inconnu -> 111 hors scope", wa5._inScope("111@g.us") === false);
  check("profil inconnu -> 222 hors scope", wa5._inScope("222@g.us") === false);
  check("profil inconnu -> 333 hors scope", wa5._inScope("333@g.us") === false);

  // --- 6) Deux configs, même profil (même contenu, projectRoot différent) -> même périmètre ---
  const sharedProfilesFile = path.join(tmp, "shared-profiles.json");
  fs.writeFileSync(
    sharedProfilesFile,
    JSON.stringify({ version: 1, profiles: { copro: ["111@g.us", "222@g.us"] } })
  );
  const settingsA = new Settings(path.join(tmp, "settingsA.json"));
  const waA = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilingFile, profile: "copro" },
    settingsA,
    new Allowlist(ceilingFile).load(),
    new Profiles(sharedProfilesFile).load()
  );
  const settingsB = new Settings(path.join(tmp, "settingsB.json"));
  const waB = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilingFile, profile: "copro" },
    settingsB,
    new Allowlist(ceilingFile).load(),
    new Profiles(sharedProfilesFile).load()
  );
  for (const jid of ["111@g.us", "222@g.us", "333@g.us"]) {
    check(`scoping par CONTENU : ${jid} identique entre deux clients`, waA._inScope(jid) === waB._inScope(jid));
  }

  // --- 7) Couche inerte (anti-régression) : pas de profiles.json, config.profile absent ---
  const noProfilesFile = path.join(tmp, "no-profiles.json"); // n'existe pas
  const wa7 = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilingFile },
    new Settings(path.join(tmp, "settings7.json")),
    new Allowlist(ceilingFile).load(),
    new Profiles(noProfilesFile).load()
  );
  check("couche inerte : canal du plafond -> inScope true", wa7._inScope("111@g.us") === true);

  // --- 8) Rechargement à chaud ---
  const hotProfilesFile = path.join(tmp, "hot-profiles.json");
  fs.writeFileSync(
    hotProfilesFile,
    JSON.stringify({ version: 1, profiles: { copro: ["222@g.us"] } }) // sans 111
  );
  const wa8 = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilingFile, profile: "copro" },
    new Settings(path.join(tmp, "settings8.json")),
    new Allowlist(ceilingFile).load(),
    new Profiles(hotProfilesFile).load()
  );
  check("avant édition : 111 hors scope (pas dans le profil)", wa8._inScope("111@g.us") === false);
  fs.writeFileSync(
    hotProfilesFile,
    JSON.stringify({ version: 1, profiles: { copro: ["111@g.us", "222@g.us"] } })
  );
  check(
    "après édition à chaud (sans reconstruire le client) : 111 passe à true",
    wa8._inScope("111@g.us") === true
  );

  // --- 9) profiles.json présent mais VIDE ({"profiles":{}}) : couche active, tout coupé ---
  const emptyProfilesFile = path.join(tmp, "empty-profiles.json");
  fs.writeFileSync(emptyProfilesFile, JSON.stringify({ version: 1, profiles: {} }));
  const emptyP = new Profiles(emptyProfilesFile).load();
  check("profiles vide : exists === true (couche active)", emptyP.exists === true);
  const wa9 = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilingFile, profile: "copro" },
    new Settings(path.join(tmp, "settings9.json")),
    new Allowlist(ceilingFile).load(),
    emptyP
  );
  check("profiles vide + profil déclaré -> 111 hors scope (fail closed)", wa9._inScope("111@g.us") === false);

  // --- 10) Canal ingéré PUIS sorti du profil à chaud : recentFor ne le sert plus ---
  const dropFile = path.join(tmp, "drop-profiles.json");
  fs.writeFileSync(dropFile, JSON.stringify({ version: 1, profiles: { copro: ["111@g.us"] } }));
  const settings10 = new Settings(path.join(tmp, "settings10.json"));
  settings10.grant("111@g.us", "Copro");
  const wa10 = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilingFile, profile: "copro" },
    settings10,
    new Allowlist(ceilingFile).load(),
    new Profiles(dropFile).load()
  );
  wa10._ingest(fakeMsg("111@g.us", "d1"));
  check("dans le profil : message ingéré et servi par recentFor", wa10.recentFor("111@g.us").messages.length === 1);
  fs.writeFileSync(dropFile, JSON.stringify({ version: 1, profiles: { copro: ["222@g.us"] } })); // retrait à chaud
  let served10;
  try { served10 = wa10.recentFor("111@g.us"); } catch { served10 = "refusé"; }
  check("après retrait à chaud du profil : recentFor refuse le canal", served10 === "refusé");
  check("le message bufferisé subsiste mais n'est plus servi", wa10.stores.get("111@g.us")?.size() === 1);
} catch (e) {
  console.error("Erreur test:", e);
  failed = true;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
