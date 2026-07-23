// Tests de src/strongauth.js (drapeau d'authentification forte, ADR-0003).
//
// Fail-secure vers le HAUT : toute incertitude (fichier absent, illisible, corrompu)
// retourne true (ON). Seul un JSON explicite {"enabled":false} désarme la garde.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readStrongAuthEnabled } from "../src/strongauth.js";

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "strongauth-test-"));
const file = (name) => path.join(tmpDir, name);

try {
  check(
    "fichier absent -> true (ON, état par défaut valide)",
    readStrongAuthEnabled(file("absent.json")) === true
  );

  const offFile = file("off.json");
  fs.writeFileSync(offFile, JSON.stringify({ enabled: false }));
  check("{enabled:false} -> false (désarmé)", readStrongAuthEnabled(offFile) === false);

  const onFile = file("on.json");
  fs.writeFileSync(onFile, JSON.stringify({ enabled: true }));
  check("{enabled:true} -> true", readStrongAuthEnabled(onFile) === true);

  // Fail-secure : SEUL le booléen `false` strict désarme ; tout autre contenu = ON.
  const edgeCases = [
    ["null", "null", true],
    ["tableau", "[]", true],
    ["nombre", "42", true],
    ["fichier vide", "", true],
    ["enabled:0", JSON.stringify({ enabled: 0 }), true],
    ['enabled:"false"', JSON.stringify({ enabled: "false" }), true],
    ["enabled:false + clés en trop", JSON.stringify({ enabled: false, note: "x" }), false],
  ];
  for (const [label, content, expected] of edgeCases) {
    const f = file(`edge-${label.replace(/\W/g, "_")}.json`);
    fs.writeFileSync(f, content);
    check(
      `${label} -> ${expected ? "true (ON)" : "false (désarmé)"}`,
      readStrongAuthEnabled(f) === expected
    );
  }

  const corruptFile = file("corrupt.json");
  fs.writeFileSync(corruptFile, "{ceci n'est pas du JSON");
  check(
    "JSON corrompu -> true (fail-secure vers le HAUT)",
    readStrongAuthEnabled(corruptFile) === true
  );

  if (process.getuid?.() === 0) {
    // Root ignore les permissions : chmod 000 reste lisible -> le test ferait un faux
    // négatif. On saute (le cas absent/corrompu couvre déjà le fail-secure de lecture).
    console.log("SKIP  fichier illisible (exécuté en root)");
  } else {
    const unreadableFile = file("unreadable.json");
    fs.writeFileSync(unreadableFile, JSON.stringify({ enabled: false }));
    fs.chmodSync(unreadableFile, 0o000);
    try {
      check(
        "fichier illisible -> true (fail-secure vers le HAUT)",
        readStrongAuthEnabled(unreadableFile) === true
      );
    } finally {
      fs.chmodSync(unreadableFile, 0o644);
    }
  }
} catch (e) {
  console.error("Erreur test:", e);
  failed = true;
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
