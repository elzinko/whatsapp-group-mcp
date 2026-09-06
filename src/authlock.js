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
//   - Si le fichier existe mais son PID est MORT (crash, kill -9) : verrou ORPHELIN.
//     On le supprime, puis on RETENTE le create O_EXCL — qui reste le SEUL arbitre
//     d'acquisition. Deux process qui récupèrent le même orphelin ne peuvent pas
//     réussir le create tous les deux : c'est ça qui empêche la collision (un premier
//     jet réclamait par rename, qui ÉCRASE et n'arbitre rien — deux récupérations
//     concurrentes gagnaient toutes les deux ⇒ la collision 440 que la fiche interdit).
//     C'est le critère central : un verrou qui survit à un crash ne doit jamais
//     transformer une panne transitoire en blocage permanent.
//
// MODÈLE DE CONCURRENCE (à connaître). Le contexte est COOPÉRATIF : même utilisateur,
// même machine, l'ennemi réel est le double-démarrage accidentel (Desktop qui relance
// son MCP pendant qu'une session Code démarre), pas un adversaire qui aligne des
// courses à la microseconde. Le create O_EXCL rend l'acquisition sur dossier VIERGE
// parfaitement exclusive. Sur récupération d'ORPHELIN, un petit jitter aléatoire
// désynchronise deux récupérations simultanées avant la suppression, de sorte qu'un
// seul recrée le verrou et que l'autre le relit « vivant » et se retire. Résiduel
// assumé : deux crash-recoveries dans la même fenêtre de ~ms restent théoriquement
// possibles — acceptable pour ce modèle coopératif ; l'escalade serait un vrai lock
// distribué (hors périmètre d'un serveur perso en lecture seule).
//
// PID RECYCLÉ (limite documentée). isProcessAlive ne distingue pas un PID mort d'un
// PID réattribué par l'OS à un AUTRE process (fréquent après un reboot : le fichier
// verrou survit, son ancien PID — souvent bas — appartient maintenant à un daemon).
// Dans ce cas rare, le verrou peut refuser de démarrer. L'échappatoire est explicite
// dans le message d'erreur (supprimer le fichier verrou à la main) ET ci-dessous —
// `npm run stop` NE supprime PAS ce fichier.
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
  // jitterMs : petit délai aléatoire avant de casser un orphelin, pour désynchroniser
  //            deux récupérations simultanées (injectable pour rendre les tests
  //            déterministes ; défaut = 0..8 ms aléatoire).
  constructor(lockPath, { pid = process.pid, isAlive = isProcessAlive, jitterMs, settleMs } = {}) {
    this.lockPath = lockPath;
    this.pid = pid;
    this.isAlive = isAlive;
    this.jitterMs = jitterMs; // délai avant cassage d'un orphelin (défaut 0..8 ms aléatoire)
    this.settleMs = settleMs; // délai de vérif post-vol (défaut 12..30 ms aléatoire)
    this.held = false;
  }

  // Tente d'acquérir le verrou. Renvoie :
  //   { acquired: true }                        — verrou libre, pris avec succès
  //   { acquired: true, reclaimedFrom: <pid> }   — verrou orphelin, cassé puis repris
  //   { acquired: false, heldByPid: <pid> }      — verrou tenu par un process vivant
  //
  // Le create O_EXCL est le SEUL arbitre : sur dossier vierge comme après cassage d'un
  // orphelin, deux process concurrents ne peuvent pas réussir le create tous les deux.
  acquire() {
    let reclaimedFrom = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        this._writeExclusive();
        this.held = true;
        // Chemin de VOL (on vient de casser un orphelin) : le create O_EXCL empêche deux
        // créations SIMULTANÉES, mais pas qu'un autre casseur supprime notre fichier frais
        // et recrée le sien juste après (fenêtre lecture-morte → unlink). On tranche par
        // « qui reste sur le disque après un court settle » : on attend, on relit, et si
        // notre PID n'y est plus, on s'est fait voler → on ne tient pas, on reboucle
        // (on relira le voleur vivant et on se retirera). Mitigation type proper-lockfile.
        if (reclaimedFrom !== null) {
          this._sleepSettle();
          if (this._readPid() !== this.pid) {
            this.held = false;
            continue;
          }
        }
        return reclaimedFrom === null ? { acquired: true } : { acquired: true, reclaimedFrom };
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
      }

      const heldByPid = this._readPid();
      if (heldByPid === this.pid) {
        // Déjà à nous (redémarrage/reconnexion interne, cf. whatsapp.js#start rappelé
        // après une coupure) : le verrou est le nôtre, rien à casser.
        this.held = true;
        return { acquired: true };
      }
      if (heldByPid !== null && this.isAlive(heldByPid)) {
        return { acquired: false, heldByPid }; // tenu par un process vivant
      }

      // Orphelin (PID mort, ou fichier illisible/vide) : on le casse, puis on reboucle
      // vers le create O_EXCL. Jitter d'abord pour désynchroniser deux casseurs.
      reclaimedFrom = heldByPid;
      this._sleepJitter();
      // Re-vérif APRÈS le jitter : si le verrou est devenu VIVANT entre-temps (un autre
      // process l'a cassé et recréé), on ne casse PAS un verrou vivant — on reboucle et
      // on le relira « tenu » pour se retirer proprement. Ferme la fenêtre où deux
      // casseurs supprimeraient tour à tour le verrou fraîchement recréé de l'autre.
      const current = this._readPid();
      if (current !== null && current !== this.pid && this.isAlive(current)) {
        continue;
      }
      try {
        fs.unlinkSync(this.lockPath);
      } catch (e) {
        if (e.code !== "ENOENT") throw e; // ENOENT : déjà cassé par un autre → reboucle
      }
    }

    // Course persistante après plusieurs tours : on tranche proprement plutôt que de
    // boucler sans fin (livelock). Un vivant détecté ⇒ perdant ; sinon on remonte une
    // erreur explicite avec l'échappatoire manuelle.
    const heldByPid = this._readPid();
    if (heldByPid !== null && heldByPid !== this.pid && this.isAlive(heldByPid)) {
      return { acquired: false, heldByPid };
    }
    throw new Error(
      `Impossible d'acquérir le verrou ${this.lockPath} après plusieurs tentatives ` +
        `(course persistante entre process). Réessaie, ou supprime le fichier à la main : ` +
        `rm ${this.lockPath}`
    );
  }

  // Message actionnable pour le perdant (critère : "quoi faire", pas juste "erreur").
  // Mentionne l'échappatoire réelle : `npm run stop` NE supprime PAS le fichier verrou,
  // donc en cas de PID recyclé (après reboot) il faut pouvoir le retirer à la main.
  static describeConflict(heldByPid, lockPath) {
    return (
      `Une autre session utilise déjà auth/ (PID ${heldByPid}). ` +
      "Coupe-la avec `npm run stop`, ou attends qu'elle libère le verrou. " +
      (lockPath
        ? `Si aucun process WhatsApp ne tourne (PID recyclé après un reboot), supprime le verrou : rm ${lockPath}`
        : "")
    );
  }

  _sleepJitter() {
    const ms = Number.isFinite(this.jitterMs) ? this.jitterMs : Math.floor(Math.random() * 8);
    this._sleepMs(ms);
  }

  // Temps de « settle » après un vol : doit dépasser la fenêtre jitter+cassage d'un
  // concurrent, pour que le dernier écrivain soit stable quand on relit. Un peu aléatoire
  // pour ne pas re-synchroniser deux settles.
  _sleepSettle() {
    const ms = Number.isFinite(this.settleMs) ? this.settleMs : 12 + Math.floor(Math.random() * 18);
    this._sleepMs(ms);
  }

  _sleepMs(ms) {
    if (!(ms > 0)) return;
    // Sommeil synchrone borné (Atomics.wait) : reste dans le chemin synchrone d'acquire.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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
