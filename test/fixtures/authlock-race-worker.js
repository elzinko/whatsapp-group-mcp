// Aide de test pour authlock.js : tente une acquisition et imprime le résultat en JSON
// sur stdout. Lancé plusieurs fois en parallèle sur le même lockPath pour prouver
// l'exclusivité sous concurrence réelle (process Node distincts).
//
// argv[2] = lockPath
// argv[3] = holdMs (optionnel) : si acquis, GARDE le verrou vivant ce temps-là avant de
//           relâcher. Indispensable pour prouver l'exclusivité : sans hold, un gagnant
//           qui sort aussitôt laisse un nouvel orphelin que le suivant récupérerait à son
//           tour (exclusion correcte dans le temps, mais impossible à compter).
import { AuthLock } from "../../src/authlock.js";

const lockPath = process.argv[2];
const holdMs = Number.parseInt(process.argv[3] || "0", 10);
const lock = new AuthLock(lockPath);
const result = lock.acquire();
process.stdout.write(JSON.stringify({ ...result, pid: process.pid }));

if (result.acquired && holdMs > 0) {
  // Sommeil synchrone : garde le PID vivant ET le verrou tenu pendant que les autres
  // process tentent leur acquisition, puis relâche proprement.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, holdMs);
  lock.release();
}
