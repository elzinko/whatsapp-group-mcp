// Le PLAFOND (allowlist) : la liste des canaux que ce serveur a le DROIT de servir.
// Voir docs/adr/0002-le-plafond-et-le-consentement.md
//
// Principe : ce fichier est édité PAR L'HUMAIN, À LA MAIN, hors de toute
// conversation. Aucun outil MCP ne sait y écrire — la capacité n'existe pas,
// comme pour l'envoi de messages (ADR-0001). Les grants (settings.json) et la
// lecture sont bornés par ce plafond : un canal hors plafond n'est ni
// autorisable, ni lisible, ni même ingéré en mémoire.
//
// Format (version 1) — deux écritures acceptées dans "channels", au choix :
//   - une chaîne : nom exact du groupe OU JID ("…@g.us") ;
//   - un objet   : { "jid": "…@g.us", "name": "Nom" } (le jid prime s'il est là).
// {
//   "version": 1,
//   "channels": [
//     "Copro Reine Blanche",
//     { "jid": "1203…@g.us", "name": "Basket loisir" }
//   ]
// }
//
// Fichier absent ou corrompu = plafond VIDE (fail closed)… sauf au tout premier
// démarrage : s'il n'existe pas encore et que des grants existent déjà, il est
// généré une seule fois depuis ces grants (migration), puis l'humain fait foi.

import fs from "node:fs";
import path from "node:path";

const VERSION = 1;

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function isGroupJid(v) {
  return typeof v === "string" && v.endsWith("@g.us");
}

// Normalise le contenu brut du fichier en entrées { jid?, name? }.
// Toute entrée inintelligible est ignorée (elle n'ouvre aucun droit).
export function parseAllowlist(raw) {
  const entries = [];
  for (const c of raw?.channels || []) {
    if (typeof c === "string") {
      const v = c.trim();
      if (!v) continue;
      entries.push(isGroupJid(v) ? { jid: v } : { name: v });
    } else if (c && typeof c === "object") {
      const jid = isGroupJid(c.jid) ? c.jid : null;
      const name = typeof c.name === "string" && c.name.trim() ? c.name.trim() : null;
      if (jid || name) entries.push({ ...(jid && { jid }), ...(name && { name }) });
    }
  }
  return entries;
}

// Comment ce canal est-il couvert par le plafond ?
//   "jid"  -> par JID exact : identité forte, personne d'autre ne peut l'usurper.
//   "name" -> par nom seulement : identité FAIBLE. Le nom d'un groupe est contrôlé
//             par ses administrateurs — un tiers peut renommer SON groupe comme le
//             tien. L'appelant doit lever cette ambiguïté (voir _ceilingHas).
//   null   -> hors plafond.
// Le JID prime toujours : on scanne toutes les entrées avant de conclure à un nom.
export function allowlistMatch(entries, jid, subject) {
  const target = normalize(subject);
  let byName = false;
  for (const e of entries) {
    if (e.jid && e.jid === jid) return "jid";
    if (e.name && target && normalize(e.name) === target) byName = true;
  }
  return byName ? "name" : null;
}

// Le plafond autorise-t-il ce canal ? (sans distinguer la force de l'identité)
export function allowlistPermits(entries, jid, subject) {
  return allowlistMatch(entries, jid, subject) !== null;
}

export class Allowlist {
  constructor(file) {
    this.file = file;
    this.entries = [];
    this.exists = false;
    this._signature = null; // mtime+taille du dernier chargement (cf. refresh)
  }

  // Recharge SI le fichier a changé. Appelé sur les chemins chauds (ingestion,
  // lecture) : un `stat` par appel, pas une lecture. C'est ce qui rend le retrait
  // d'un canal effectif IMMÉDIATEMENT — le geste d'urgence de l'humain (éditer le
  // fichier pour couper un canal) ne doit pas attendre un redémarrage.
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

  match(jid, subject) {
    return allowlistMatch(this.entries, jid, subject);
  }

  // (Re)charge le fichier. Appelé au démarrage ET avant chaque décision de grant,
  // pour que les éditions manuelles s'appliquent sans redémarrer le serveur.
  load() {
    this.exists = fs.existsSync(this.file);
    if (!this.exists) {
      this.entries = [];
      return this;
    }
    try {
      this.entries = parseAllowlist(JSON.parse(fs.readFileSync(this.file, "utf8")));
    } catch {
      this.entries = []; // corrompu = plafond vide (fail closed)
    }
    return this;
  }

  permits(jid, subject) {
    return allowlistPermits(this.entries, jid, subject);
  }

  // Migration au premier démarrage : pas de fichier -> on le crée, une seule fois,
  // depuis les grants existants (aucune régression pour un serveur déjà configuré),
  // ou vide s'il n'y a encore rien. C'est la SEULE écriture de ce fichier par le
  // code, et elle a lieu avant tout appel d'outil.
  bootstrap(settings) {
    if (fs.existsSync(this.file)) return this.load();
    const channels = settings.list().map((g) => ({ jid: g.jid, ...(g.subject && { name: g.subject }) }));
    const data = {
      version: VERSION,
      _doc:
        "PLAFOND des canaux servis par whatsapp-group-mcp. Édite ce fichier À LA MAIN : " +
        "aucun outil MCP ne peut le modifier. Une entrée = un nom exact de groupe, un JID " +
        "(…@g.us), ou { jid, name }. Un canal absent d'ici n'est ni autorisable ni lisible.",
      channels,
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    return this.load();
  }
}
