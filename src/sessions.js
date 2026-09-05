// Registre des sessions de lecture (fiche 20260902223310499 — droits par session).
// Même convention que Settings/Allowlist : une classe, un chemin injecté (ici un
// DOSSIER, un fichier par jeton), écriture atomique tmp+rename, testable sur un
// tmpdir. Voir docs/adr/000x-droits-par-session.md.
//
// Ce module IGNORE tout du domaine WhatsApp : `channels` est une simple liste de
// chaînes opaques pour lui (des JID, en pratique — composés par src/index.js).
// Le domaine (whatsapp.js) reste inchangé ; c'est index.js qui compose les deux.
//
// Le jeton NE PROUVE PAS une identité (ADR-0002 : « un jeton local, c'est du
// théâtre »). Il SÉLECTIONNE un périmètre de lecture ouvert par un geste humain
// (Touch ID ou élicitation), borné dans le temps (TTL) et révocable.
//
// Format d'un fichier `sessions/<id>.json` :
// { "id": "<32 hex>", "channels": ["…@g.us"], "createdAt": "ISO", "expiresAt": "ISO",
//   "lastSeenAt": "ISO" }
//
// Fail-closed : un jeton absent, mal formé, expiré, ou dont le fichier est corrompu
// est refusé — et purgé sur-le-champ (purge paresseuse), sans attendre un balayage.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000; // 8h (fiche), surchargeable par l'appelant

// Un jeton est 128 bits aléatoires rendus en hex par crypto.randomBytes(16) : 32
// caractères hexadécimaux, jamais autre chose. Sert aussi à empêcher toute
// traversée de chemin via un jeton fourni par l'appelant (../../etc).
function isWellFormedToken(id) {
  return typeof id === "string" && /^[a-f0-9]{32}$/.test(id);
}

export class SessionRegistry {
  constructor(dir, { defaultTtlMs = DEFAULT_TTL_MS } = {}) {
    this.dir = dir;
    this.defaultTtlMs = defaultTtlMs;
  }

  _fileFor(id) {
    return path.join(this.dir, `${id}.json`);
  }

  _ensureDir() {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
  }

  _write(session) {
    this._ensureDir();
    const file = this._fileFor(session.id);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(session, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  _remove(id) {
    try {
      fs.unlinkSync(this._fileFor(id));
    } catch {
      /* déjà absent : rien à faire */
    }
  }

  // Lit et valide la FORME d'un fichier de session. Un fichier illisible ou dont
  // le contenu ne ressemble pas à une session est traité comme corrompu : il est
  // supprimé (il n'a plus aucune chance de resservir) et null est renvoyé —
  // fail-closed, jamais une session partielle ou devinée.
  _read(id) {
    const file = this._fileFor(id);
    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      return null;
    }
    try {
      const session = JSON.parse(raw);
      const valid =
        session &&
        typeof session.id === "string" &&
        Array.isArray(session.channels) &&
        typeof session.createdAt === "string" &&
        typeof session.expiresAt === "string" &&
        typeof session.lastSeenAt === "string" &&
        !Number.isNaN(new Date(session.expiresAt).getTime());
      if (!valid) throw new Error("forme de session invalide");
      return session;
    } catch {
      this._remove(id); // corrompu = mort, tout de suite
      return null;
    }
  }

  _isExpired(session, now = Date.now()) {
    return new Date(session.expiresAt).getTime() <= now;
  }

  _ids() {
    this._ensureDir();
    let entries;
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    return entries
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .filter(isWellFormedToken);
  }

  // Ouvre une session sur un périmètre de canaux déjà résolu par l'appelant
  // (index.js) — ce module ne sait pas résoudre un nom en JID, ni vérifier un
  // grant ou un plafond : ces vérifications ont lieu AVANT l'appel à create().
  create(channels, ttlMs = this.defaultTtlMs) {
    const now = new Date();
    const session = {
      id: crypto.randomBytes(16).toString("hex"), // 128 bits, opaque
      channels: [...channels],
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      lastSeenAt: now.toISOString(),
    };
    this._write(session);
    return session;
  }

  // Résout un jeton en session valide. PURGE PARESSEUSE : un jeton expiré est
  // supprimé et refusé sur-le-champ (pas de timer, pas de balayage à attendre).
  // `lastSeenAt` avance à chaque résolution réussie (audit, purge des sessions
  // mortes lors d'un balayage ultérieur).
  resolve(token) {
    if (!isWellFormedToken(token)) return null;
    const session = this._read(token);
    if (!session) return null;
    if (this._isExpired(session)) {
      this._remove(token);
      return null;
    }
    session.lastSeenAt = new Date().toISOString();
    this._write(session);
    return session;
  }

  // Révoque un jeton. Réduire est toujours permis : pas de cérémonie, pas de
  // vérification autre que la forme du jeton.
  close(token) {
    if (!isWellFormedToken(token)) return false;
    const existed = this._read(token) !== null;
    if (existed) this._remove(token);
    return existed;
  }

  // Balayage opportuniste (appelé par session_open et whatsapp_status, en plus
  // de la purge paresseuse de resolve()) : supprime toutes les sessions expirées.
  // Renvoie le nombre de sessions purgées.
  purgeExpired() {
    let removed = 0;
    for (const id of this._ids()) {
      const session = this._read(id); // purge aussi les fichiers corrompus rencontrés
      if (session && this._isExpired(session)) {
        this._remove(id);
        removed += 1;
      }
    }
    return removed;
  }

  // Sessions actives, après balayage. Pour la CLI humaine et pour
  // `whatsapp_status` (compte uniquement — jamais le contenu à une conversation
  // qui ne porte pas le jeton correspondant).
  list() {
    this.purgeExpired();
    return this._ids()
      .map((id) => this._read(id))
      .filter(Boolean)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
