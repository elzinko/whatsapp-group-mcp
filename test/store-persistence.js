// Test de la persistance disque du MessageStore :
// - add() écrit sur disque,
// - un nouveau store attaché au même fichier recharge l'historique,
// - le dédoublonnage évite les doublons,
// - le cap mémoire n'empêche pas l'archive disque de tout garder.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MessageStore } from "../src/store.js";

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-store-"));
const file = path.join(tmp, "group.jsonl");

const msg = (id, ts, text) => ({
  id,
  groupId: "123@g.us",
  sender: "a@s.whatsapp.net",
  fromMe: false,
  pushName: "Alice",
  text,
  timestamp: ts,
});

try {
  // 1) Premier store : max 2 en mémoire, écrit 3 messages
  const s1 = new MessageStore(2);
  check("attachFile sur fichier neuf renvoie 0", s1.attachFile(file) === 0);
  s1.add(msg("m1", 100, "un"));
  s1.add(msg("m2", 200, "deux"));
  s1.add(msg("m3", 300, "trois"));
  check("mémoire plafonnée à 2", s1.size() === 2);

  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  check("les 3 messages sont sur disque (archive complète)", lines.length === 3);

  // 2) Deuxième store : recharge depuis le même fichier
  // RÉGRESSION (CodeQL js/file-system-race) : attachFile crée le fichier s'il manque,
  // mais ne doit JAMAIS tronquer une archive existante — sinon rattacher un store à un
  // canal déjà archivé effacerait tout son historique.
  const s2 = new MessageStore(500);
  const loaded = s2.attachFile(file);
  check("attachFile ne tronque pas une archive existante", fs.readFileSync(file, "utf8").trim().split("\n").length === 3);
  check("rechargement lit 3 messages du disque", loaded === 3);
  check("mémoire contient 3 messages après reload", s2.size() === 3);
  const recent = s2.recent(3);
  check("ordre chronologique conservé", recent.map((m) => m.id).join(",") === "m1,m2,m3");
  check("texte relu correctement", recent[0].text === "un");

  // 3) Dédoublonnage : ré-ajouter un id connu ne duplique pas
  s2.add(msg("m2", 200, "deux"));
  check("pas de doublon en mémoire", s2.size() === 3);
  const linesAfter = fs.readFileSync(file, "utf8").trim().split("\n");
  check("pas de doublon sur disque", linesAfter.length === 3);

  // 4) Nouveau message après reload -> ajouté partout
  s2.add(msg("m4", 400, "quatre"));
  check("nouveau message pris en compte", s2.size() === 4);
  check(
    "nouveau message écrit sur disque",
    fs.readFileSync(file, "utf8").trim().split("\n").length === 4
  );
} catch (e) {
  console.error("Erreur test:", e);
  failed = true;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
