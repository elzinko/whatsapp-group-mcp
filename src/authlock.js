// Verrou OS exclusif sur auth/ — garde-fou anti-collision entre process.
// Voir features/0009-verrou-exclusif-auth.md
//
// PROBLÈME : deux process Baileys vivants sur le même dossier auth/ ⇒ erreur 440,
// rate-limit, appairage rasé. Le "prestart: stop.js" ne coupe pas une COURSE : deux
// `npm start` lancés en même temps passent tous les deux le stop puis ouvrent auth/.
//
// MÉCANISME : un fichier PID écrit en O_EXCL (échoue si le fichier existe déjà —
// c'est l'exclusivité). Le fichier contient le PID du détenteur.
//   - Si le fichier existe et son PID est VIVANT (process.kill(pid, 0) ne throw pas
//     ESRCH) et que ce n'est pas nous : le verrou est TENU, on échoue proprement.
//   - Si le fichier existe mais son PID est MORT (crash, kill -9) : verrou ORPHELIN,
//     on le RÉCLAME (réécriture atomique avec notre PID) sans intervention humaine.
//     C'est le critère central de la fiche : un verrou qui survit à un crash ne doit
//     jamais transformer une panne transitoire en blocage permanent.
//
// EMPLACEMENT DU VERROU : à CÔTÉ de auth/ (ex. "auth.lock"), pas DEDANS. auth/ est
// entièrement supprimé au wipe post-401 (ré-appairage, voir whatsapp.js) — un verrou
// logé dedans disparaîtrait avec lui et perdrait sa trace au pire moment (juste avant
// qu'un nouveau process ne réutilise le dossier).
//
// Chemin injecté (comme src/settings.js), donc testable sur tmpdir sans toucher au
// vrai auth/ du projet.

import fs from "node:fs";
import path from "node:path";

// Dérive le chemin de verrou par défaut à partir de authDir : "<authDir>.lock".
export function defaultLockPath(authDir) {
  return `${authDir}.lock`;
}

// Vrai si `pid` désigne un process actuellement vivant. process.kill(pid, 0) n'envoie
// aucun signal : il ne fait que vérifier l'existence du process (throw ESRCH si mort).
export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // ESRCH = aucun process avec ce PID. Tout autre code (ex. EPERM, permission refusée
    // sur un PID appartenant à un autre utilisateur) signifie qu'il existe bel et bien.
    return e.code !== "ESRCH";
  }
}

export class AuthLock {
  // lockPath : chemin du fichier PID.
  // pid      : PID à écrire en cas d'acquisition (injectable pour les tests).
  // isAlive  : vérification d'un PID vivant (injectable pour les tests).
  constructor(lockPath, { pid = process.pid, isAlive = isProcessAlive } = {}) {
    this.lockPath = lockPath;
    this.pid = pid;
    this.isAlive = isAlive;
    this.held = false;
  }

  // Tente d'acquérir le verrou. Renvoie :
  //   { acquired: true }                        — verrou libre, pris avec succès
  //   { acquired: true, reclaimedFrom: <pid> }   — verrou orphelin, réclamé
  //   { acquired: false, heldByPid: <pid> }      — verrou tenu par un process vivant
  acquire() {
    try {
      this._writeExclusive();
      this.held = true;
      return { acquired: true };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }

    const heldByPid = this._readPid();
    if (heldByPid !== null && heldByPid !== this.pid && this.isAlive(heldByPid)) {
      return { acquired: false, heldByPid };
    }

    // Verrou orphelin (PID mort) — ou déjà tenu par nous (redémarrage/reconnexion
    // interne, cf. whatsapp.js#start rappelé après une coupure) : on le réclame.
    this._reclaim();
    this.held = true;
    return heldByPid === null ? { acquired: true } : { acquired: true, reclaimedFrom: heldByPid };
  }

  // Message actionnable pour le perdant (critère : "quoi faire", pas juste "erreur").
  static describeConflict(heldByPid) {
    return (
      `Une autre session utilise déjà auth/ (PID ${heldByPid}). ` +
      "Coupe-la avec `npm run stop`, ou attends qu'elle libère le verrou."
    );
  }

  // Libère le verrou — SEULEMENT s'il nous appartient encore (évite d'effacer le
  // verrou d'un autre process qui l'aurait entre-temps réclamé après un crash).
  release() {
    if (!this.held) return;
    try {
      if (this._readPid() === this.pid) fs.unlinkSync(this.lockPath);
    } catch {
      // Fichier déjà absent ou illisible : rien à faire, le verrou est de toute façon libre.
    }
    this.held = false;
  }

  _writeExclusive() {
    fs.mkdirSync(path.dirname(this.lockPath), { recursive: true, mode: 0o700 });
    const fd = fs.openSync(this.lockPath, "wx", 0o600); // wx = O_CREAT|O_EXCL|O_WRONLY
    try {
      fs.writeFileSync(fd, String(this.pid));
    } finally {
      fs.closeSync(fd);
    }
  }

  // Réécriture atomique (tmp + rename) : jamais de fenêtre où le fichier est vide ou
  // à moitié écrit pendant qu'un autre process le lit.
  _reclaim() {
    const tmp = `${this.lockPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, String(this.pid), { mode: 0o600 });
    fs.renameSync(tmp, this.lockPath);
  }

  _readPid() {
    try {
      const raw = fs.readFileSync(this.lockPath, "utf8").trim();
      const pid = Number.parseInt(raw, 10);
      return Number.isInteger(pid) ? pid : null;
    } catch {
      return null;
    }
  }
}
