// Test du verrou OS exclusif sur auth/ (fiche 0009).
// Hermétique : tout se passe dans un tmpdir, aucun contact avec le vrai auth/ du projet.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AuthLock, defaultLockPath, isProcessAlive } from "../src/authlock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-authlock-"));
const authDir = path.join(tmp, "auth");
const lockPath = defaultLockPath(authDir);

try {
  // 0) Emplacement du verrou : à côté de auth/, pas dedans.
  check("le verrou par défaut est un chemin frère de auth/, pas un fichier dedans", lockPath === `${authDir}.lock`);

  // 1) acquire() réussit sur un dossier libre.
  const owner = new AuthLock(lockPath);
  const first = owner.acquire();
  check("premier acquire réussit sur un verrou libre", first.acquired === true);
  check("le fichier de verrou contient le PID du détenteur", fs.readFileSync(lockPath, "utf8").trim() === String(process.pid));

  // 2) Un 2e acquire sur le même verrou, PID vivant simulé = le PID courant, échoue
  //    proprement (pas de dégât : le fichier garde le PID du premier détenteur).
  const challenger = new AuthLock(lockPath, { pid: 999999 }); // PID distinct, forcément != owner
  const second = challenger.acquire();
  check("un 2e acquire sur un verrou tenu par un PID vivant échoue", second.acquired === false);
  check("l'échec rapporte le PID du détenteur", second.heldByPid === process.pid);
  check("le fichier n'a pas été altéré par la tentative perdante", fs.readFileSync(lockPath, "utf8").trim() === String(process.pid));

  // 3) Le message du perdant dit quoi faire, pas juste "erreur".
  const message = AuthLock.describeConflict(second.heldByPid);
  check("le message mentionne npm run stop", message.includes("npm run stop"));
  check("le message mentionne le PID détenteur", message.includes(String(process.pid)));
  check("le message n'est pas un simple mot 'erreur'", message.length > 20 && /auth/.test(message));

  // 4) release() libère ; re-acquire OK ensuite (autre "process" représenté par un PID différent).
  owner.release();
  check("le fichier de verrou disparaît après release()", !fs.existsSync(lockPath));
  const reacquirer = new AuthLock(lockPath, { pid: 555555 });
  const third = reacquirer.acquire();
  check("un nouvel acquire après release() réussit", third.acquired === true);
  check("le fichier contient le PID du nouveau détenteur", fs.readFileSync(lockPath, "utf8").trim() === "555555");
  reacquirer.release();

  // 5) Verrou orphelin : fichier avec un PID mort -> le nouvel acquire RÉCLAME et réussit.
  //    On obtient un PID garanti mort en attendant la fin réelle d'un process enfant.
  const dead = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
  const deadPid = dead.pid;
  check("le process enfant utilisé pour le PID mort est bien terminé", !isProcessAlive(deadPid));

  fs.writeFileSync(lockPath, String(deadPid));
  const rescuer = new AuthLock(lockPath, { pid: 777777 });
  const fourth = rescuer.acquire();
  check("un verrou orphelin (PID mort) est réclamé sans suppression manuelle", fourth.acquired === true);
  check("l'acquisition orpheline rapporte le PID récupéré", fourth.reclaimedFrom === deadPid);
  check("le fichier contient désormais le PID du nouveau détenteur", fs.readFileSync(lockPath, "utf8").trim() === "777777");
  rescuer.release();

  // 6) Réentrance : le même détenteur peut ré-acquérir son propre verrou (redémarrage
  //    interne / reconnexion, cf. whatsapp.js#start rappelé après une coupure réseau).
  const self1 = new AuthLock(lockPath, { pid: 424242 });
  check("première acquisition (self) réussit", self1.acquire().acquired === true);
  const self2 = new AuthLock(lockPath, { pid: 424242 });
  const selfReacquire = self2.acquire();
  check("le même PID peut ré-acquérir son propre verrou", selfReacquire.acquired === true);
  self2.release();

  // 7) Exclusivité sous concurrence réelle : deux process Node distincts tentent
  //    d'acquérir le même verrou en même temps. Un seul doit gagner ; l'état final
  //    du fichier prouve l'exclusivité (un seul PID, celui du gagnant).
  const raceLockPath = path.join(tmp, "race.lock");
  const helper = path.join(__dirname, "fixtures", "authlock-race-worker.js");
  const p1 = spawn(process.execPath, [helper, raceLockPath]);
  const p2 = spawn(process.execPath, [helper, raceLockPath]);

  const collect = (proc) =>
    new Promise((resolve) => {
      let out = "";
      proc.stdout.on("data", (d) => (out += d));
      proc.on("close", () => resolve(out.trim()));
    });

  const [out1, out2] = await Promise.all([collect(p1), collect(p2)]);
  const results = [JSON.parse(out1), JSON.parse(out2)];
  const acquiredCount = results.filter((r) => r.acquired).length;
  check("sous concurrence réelle, un seul des deux process acquiert le verrou", acquiredCount === 1);
  const winner = results.find((r) => r.acquired);
  check(
    "le fichier de verrou final contient le PID du seul gagnant",
    fs.readFileSync(raceLockPath, "utf8").trim() === String(winner.pid)
  );
} catch (e) {
  console.error("Erreur test:", e);
  failed = true;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
