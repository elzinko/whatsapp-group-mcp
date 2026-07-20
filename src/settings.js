// Réglages persistants du serveur : la liste des canaux autorisés (« grants »).
// Voir docs/adr/0001-modele-d-acces-aux-canaux.md
//
// Pourquoi un fichier dédié plutôt que auth/ ou data/ :
// - auth/ est EFFACÉ au logout WhatsApp -> les grants seraient perdus ;
// - data/ est l'archive des messages, pas de la configuration.
//
// Format (version 1) :
// {
//   "version": 1,
//   "grants": [{ "jid": "…@g.us", "scope": "read", "subject": "Nom", "grantedAt": "ISO" }]
// }
//
// La portée (`scope`) est explicite alors qu'une seule existe aujourd'hui ("read").
// C'est volontaire : l'écriture ne doit JAMAIS pouvoir arriver par extension d'un
// grant de lecture (ADR-0001).

import fs from "node:fs";
import path from "node:path";

const VERSION = 1;
export const SCOPE_READ = "read";

export class Settings {
  constructor(file) {
    this.file = file;
    this.grants = new Map(); // jid -> { scope, subject, grantedAt }
  }

  // Charge le fichier s'il existe. Un fichier absent ou corrompu = aucun grant :
  // on démarre fermé plutôt que de planter (fail closed).
  load() {
    if (!fs.existsSync(this.file)) return this;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      for (const g of raw?.grants || []) {
        // Toute portée inconnue est ignorée : un settings.json écrit par une version
        // future ne peut pas accorder un droit que ce code ne sait pas honorer.
        if (!g?.jid || g.scope !== SCOPE_READ) continue;
        this.grants.set(g.jid, {
          scope: SCOPE_READ,
          subject: g.subject || null,
          grantedAt: g.grantedAt || null,
        });
      }
    } catch {
      this.grants.clear();
    }
    return this;
  }

  save() {
    const data = {
      version: VERSION,
      grants: this.list(),
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    // Écriture atomique : pas de settings.json à moitié écrit si ça coupe.
    // mode 0600 : les canaux autorisés sont une donnée privée (noms/JID de tes groupes).
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  has(jid) {
    return this.grants.has(jid);
  }

  list() {
    return [...this.grants.entries()].map(([jid, g]) => ({ jid, ...g }));
  }

  // Accorde (ou rafraîchit) un grant de LECTURE. Le `subject` doit toujours provenir
  // de Baileys, jamais d'un argument fourni par l'appelant (ADR-0001).
  grant(jid, subject) {
    const existing = this.grants.get(jid);
    this.grants.set(jid, {
      scope: SCOPE_READ,
      subject: subject || null,
      grantedAt: existing?.grantedAt || new Date().toISOString(),
    });
    this.save();
    return this.grants.get(jid);
  }

  revoke(jid) {
    const had = this.grants.delete(jid);
    if (had) this.save();
    return had;
  }
}
