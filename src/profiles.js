// Le PROFIL (fiche 0004) : seconde borne, au même point que le plafond.
// Voir docs/adr/0006-profils-par-projet.md
//
// _inScope(jid) = _ceilingHas(jid) ET _profileHas(jid)
//
// Format (réutilise celui du plafond, src/allowlist.js) :
// {
//   "version": 1,
//   "profiles": {
//     "copro": ["111@g.us", { "jid": "222@g.us", "name": "Basket loisir" }],
//     "famille": ["333@g.us"]
//   }
// }
//
// Activation opt-in (ADR-0006) : ni profiles.json ni WHATSAPP_PROFILE -> couche
// INERTE (comportement ADR-0002 inchangé). Dès que l'un des deux existe -> fail
// closed : profil non déclaré ou inconnu -> rien.

import fs from "node:fs";

import { parseAllowlist, allowlistMatch } from "./allowlist.js";

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

export class Profiles {
  constructor(file) {
    this.file = file;
    this.byName = new Map(); // nom normalisé -> entrées (format allowlist)
    this.exists = false;
    this._signature = null; // mtime+taille du dernier chargement (cf. refresh)
  }

  // Recharge SI le fichier a changé. Même logique que Allowlist.refresh() : un
  // `stat` par appel, pas une lecture, pour que l'édition manuelle s'applique
  // sans redémarrage.
  refresh() {
    let sig = "absent";
    try {
      const st = fs.statSync(this.file);
      sig = `${st.mtimeMs}:${st.size}`;
    } catch {
      /* absent : signature "absent" */
    }
    if (sig !== this._signature) {
      this._signature = sig;
      this.load();
    }
    return this;
  }

  // (Re)charge le fichier. Fichier absent ou corrompu = aucun profil (fail closed).
  load() {
    this.exists = fs.existsSync(this.file);
    this.byName = new Map();
    if (!this.exists) return this;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      for (const [name, list] of Object.entries(raw?.profiles || {})) {
        this.byName.set(normalize(name), parseAllowlist({ channels: list }));
      }
    } catch {
      this.byName = new Map(); // corrompu = aucun profil (fail closed)
    }
    return this;
  }

  // Type de couverture du profil `name` pour ce canal : "jid" | "name" | null.
  // L'appelant (_profileHas) applique sur "name" la même garde anti-homonyme que le
  // plafond. Profil inconnu -> null (rien).
  match(name, jid, subject) {
    const entries = this.byName.get(normalize(name));
    if (!entries) return null; // profil inconnu -> rien
    return allowlistMatch(entries, jid, subject);
  }

  // Ce canal est-il couvert par le profil `name` ? (sans distinguer la force)
  permits(name, jid, subject) {
    return this.match(name, jid, subject) !== null;
  }
}
