// Tests du CONTRAT de src/touchid.js (checkPresence), SANS biométrie.
//
// Le dernier mètre — la boîte Touch ID réellement affichée et le doigt de l'humain —
// est non-automatisable PAR CONSTRUCTION (comme test/elicitation.js pour le
// consentement). Ce que ce test prouve : le wrapper Node mappe correctement les
// codes de sortie d'un helper injecté (fail-closed), sans jamais dépendre du PATH
// ni de la vraie biométrie. Voir scripts/touchid-probe-mcp.js pour le relevé humain.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPresence, TOUCHID } from "../src/touchid.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, "fixtures", "fake-touchid.sh");

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

try {
  let r = await checkPresence({ reason: "ok", swift: "/bin/sh", script: fixture });
  check(
    "code 0 -> authenticated, fail-closed ok:true UNIQUEMENT ici",
    r.ok === true && r.status === TOUCHID.AUTHENTICATED
  );

  r = await checkPresence({ reason: "refuse", swift: "/bin/sh", script: fixture });
  check("code 1 -> refused, ok:false", r.ok === false && r.status === TOUCHID.REFUSED);

  r = await checkPresence({ reason: "unavailable", swift: "/bin/sh", script: fixture });
  check("code 2 -> unavailable, ok:false", r.ok === false && r.status === TOUCHID.UNAVAILABLE);

  r = await checkPresence({ reason: "weird", swift: "/bin/sh", script: fixture });
  check(
    "code inattendu (3) -> error, fail-closed (jamais accepté par défaut)",
    r.ok === false && r.status === TOUCHID.ERROR
  );

  r = await checkPresence({
    reason: "peu importe",
    swift: "/bin/does-not-exist-touchid-probe",
    script: fixture,
  });
  check(
    "binaire introuvable -> error, fail-closed (pas de dépendance au PATH)",
    r.ok === false && r.status === TOUCHID.ERROR
  );

  r = await checkPresence({ reason: "hang", swift: "/bin/sh", script: fixture, timeoutMs: 200 });
  check("timeout -> error, fail-closed (jamais d'accord silencieux)", r.ok === false && r.status === TOUCHID.ERROR);

} catch (e) {
  console.error("Erreur test:", e);
  failed = true;
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
