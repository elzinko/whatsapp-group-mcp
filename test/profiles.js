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

  // --- 11) Anti-homonyme AU PROFIL (Codex #34) : plafond admet 2 JID homonymes par
  //         identité forte ; un profil PAR NOM ne doit pas les rouvrir (sinon un admin
  //         renomme son groupe au nom du profil et s'y infiltre) ---
  const ceilAmbFile = path.join(tmp, "ceil-amb.json");
  fs.writeFileSync(ceilAmbFile, JSON.stringify({ version: 1, channels: ["111@g.us", "222@g.us"] }));
  const profAmbFile = path.join(tmp, "prof-amb.json");
  fs.writeFileSync(profAmbFile, JSON.stringify({ version: 1, profiles: { p: ["Copro"] } })); // par NOM
  const wa11 = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceilAmbFile, profile: "p" },
    new Settings(path.join(tmp, "settings11.json")),
    new Allowlist(ceilAmbFile).load(),
    new Profiles(profAmbFile).load()
  );
  wa11.knownGroups = new Map([["111@g.us", "Copro"], ["222@g.us", "Copro"]]); // 2 homonymes
  check("anti-homonyme : plafond admet 111 par JID", wa11._ceilingHas("111@g.us") === true);
  check("anti-homonyme : plafond admet 222 par JID", wa11._ceilingHas("222@g.us") === true);
  check("anti-homonyme : profil par nom ambigu -> 111 hors scope", wa11._inScope("111@g.us") === false);
  check("anti-homonyme : profil par nom ambigu -> 222 hors scope", wa11._inScope("222@g.us") === false);
  fs.writeFileSync(profAmbFile, JSON.stringify({ version: 1, profiles: { p: ["111@g.us"] } })); // désambiguïsé par JID
  check("anti-homonyme : profil par JID exact -> 111 in scope", wa11._inScope("111@g.us") === true);
  check("anti-homonyme : profil par JID exact -> 222 reste hors scope", wa11._inScope("222@g.us") === false);

  // --- 12) status() CACHE les grants hors du profil actif (Codex #34) ---
  const ceil12 = path.join(tmp, "ceil12.json");
  fs.writeFileSync(ceil12, JSON.stringify({ version: 1, channels: ["111@g.us", "222@g.us", "333@g.us"] }));
  const prof12 = path.join(tmp, "prof12.json");
  fs.writeFileSync(prof12, JSON.stringify({ version: 1, profiles: { copro: ["111@g.us"] } }));
  const settings12 = new Settings(path.join(tmp, "settings12.json"));
  settings12.grant("111@g.us", "Copro", "elicitation");
  settings12.grant("222@g.us", "Autre projet", "touchid"); // au plafond mais hors profil copro
  settings12.grant("333@g.us", "Encore un", "elicitation"); // idem
  const wa12 = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceil12, profile: "copro" },
    settings12,
    new Allowlist(ceil12).load(),
    new Profiles(prof12).load()
  );
  const st12 = wa12.status().grantedChannels;
  check("status : seul le canal du profil est listé (111)", st12.length === 1 && st12[0].jid === "111@g.us");
  check(
    "status : aucun grant hors profil divulgué (ni 222 ni 333)",
    !st12.some((g) => g.jid === "222@g.us" || g.jid === "333@g.us")
  );
  // #5 (Codex #34) : session_open filtre par `settings.has(jid) && _inScope(jid)`. Un grant
  // AU plafond mais HORS profil (222) doit tomber côté refusé ; un grant DANS le profil (111)
  // doit passer. On vérifie le prédicat exact que session_open utilise désormais.
  check(
    "session_open filter : grant hors profil (222) serait REFUSÉ",
    wa12.settings.has("222@g.us") === true && wa12._inScope("222@g.us") === false
  );
  check(
    "session_open filter : grant dans le profil (111) serait ADMIS",
    wa12.settings.has("111@g.us") === true && wa12._inScope("111@g.us") === true
  );

  // --- 13) listGroups distingue hors-plafond et hors-profil (Codex #34) ---
  const ceil13 = path.join(tmp, "ceil13.json");
  fs.writeFileSync(ceil13, JSON.stringify({ version: 1, channels: ["111@g.us", "222@g.us"] }));
  const prof13 = path.join(tmp, "prof13.json");
  fs.writeFileSync(prof13, JSON.stringify({ version: 1, profiles: { copro: ["111@g.us"] } }));
  const wa13 = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceil13, profile: "copro" },
    new Settings(path.join(tmp, "settings13.json")),
    new Allowlist(ceil13).load(),
    new Profiles(prof13).load()
  );
  wa13.state = "open";
  wa13.sock = {
    groupFetchAllParticipating: async () =>
      Object.fromEntries(
        [["111@g.us", "A"], ["222@g.us", "B"], ["999@g.us", "C"]].map(([jid, subject]) => [
          jid,
          { id: jid, subject, participants: [] },
        ])
      ),
  };
  const menu13 = await wa13.listGroups();
  check("listGroups : seul 111 (plafond ∩ profil) visible", menu13.groups.length === 1 && menu13.groups[0].id === "111@g.us");
  check("listGroups : 999 compté hors plafond", menu13.hiddenOutsideAllowlist === 1);
  check("listGroups : 222 compté hors profil (pas hors plafond)", menu13.hiddenOutsideProfile === 1);

  // --- 14) Match par NOM sans inventaire autoritatif (knownGroups vide) -> fail closed
  //         (Codex #34 round 2 : le MCP sert avant _refreshGroups) ---
  const ceil14 = path.join(tmp, "ceil14.json");
  fs.writeFileSync(ceil14, JSON.stringify({ version: 1, channels: ["111@g.us"] }));
  const prof14 = path.join(tmp, "prof14.json");
  fs.writeFileSync(prof14, JSON.stringify({ version: 1, profiles: { p: ["Copro"] } })); // par NOM
  const settings14 = new Settings(path.join(tmp, "settings14.json"));
  settings14.grant("111@g.us", "Copro", "elicitation"); // subject connu via le grant (avant tout _refreshGroups)
  const wa14 = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceil14, profile: "p" },
    settings14,
    new Allowlist(ceil14).load(),
    new Profiles(prof14).load()
  );
  check("nom sans inventaire (knownGroups vide) -> hors scope (fail closed)", wa14._inScope("111@g.us") === false);
  wa14.knownGroups = new Map([["111@g.us", "Copro"]]); // inventaire chargé, nom unique
  check("nom avec inventaire unique -> in scope", wa14._inScope("111@g.us") === true);

  // --- 15) grant_channel sur un canal AU plafond mais HORS profil -> conseille profiles.json
  //         (pas allowlist.json), Codex #34 round 2 ---
  const ceil15 = path.join(tmp, "ceil15.json");
  fs.writeFileSync(ceil15, JSON.stringify({ version: 1, channels: ["111@g.us", "222@g.us"] }));
  const prof15 = path.join(tmp, "prof15.json");
  fs.writeFileSync(prof15, JSON.stringify({ version: 1, profiles: { copro: ["111@g.us"] } }));
  const wa15 = new WhatsAppClient(
    { maxMessages: 10, persist: false, allowlistFile: ceil15, profile: "copro", profilesFile: prof15 },
    new Settings(path.join(tmp, "settings15.json")),
    new Allowlist(ceil15).load(),
    new Profiles(prof15).load()
  );
  wa15.state = "open";
  wa15.sock = {
    groupFetchAllParticipating: async () => ({ "222@g.us": { id: "222@g.us", subject: "Autre", participants: [] } }),
  };
  let err15 = "";
  try {
    await wa15.grantChannel("222@g.us");
  } catch (e) {
    err15 = e.message;
  }
  check("grant hors profil -> erreur oriente vers profiles.json, pas le plafond", /profil/i.test(err15) && err15.includes("profiles"));
} catch (e) {
  console.error("Erreur test:", e);
  failed = true;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
