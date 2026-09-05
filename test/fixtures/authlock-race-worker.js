// Aide de test pour authlock.js : tente une acquisition et imprime le résultat en JSON
// sur stdout. Lancé deux fois en parallèle sur le même lockPath pour prouver
// l'exclusivité sous concurrence réelle (deux process Node distincts).
import { AuthLock } from "../../src/authlock.js";

const lockPath = process.argv[2];
const lock = new AuthLock(lockPath);
const result = lock.acquire();
process.stdout.write(JSON.stringify({ ...result, pid: process.pid }));
