// Tampon des derniers messages reçus, UNIQUEMENT pour le groupe autorisé.
// Aucun message d'un autre groupe/contact n'est stocké : 1re barrière de sécurité.
//
// Persistance optionnelle sur disque au format JSONL (une ligne = un message).
// - Le fichier est une archive append-only (historique complet).
// - La mémoire ne garde que les `max` derniers messages.

import fs from "node:fs";
import path from "node:path";

export class MessageStore {
  constructor(maxMessages = 500) {
    this.max = maxMessages;
    this.messages = [];
    this.seen = new Set(); // ids déjà connus (dédoublonnage history + live + disque)
    this.file = null;
  }

  // Attache un fichier de persistance : charge l'existant puis active l'append.
  // Retourne le nombre de messages chargés depuis le disque.
  attachFile(filePath) {
    this.file = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    let loaded = 0;
    if (fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          this._insert(JSON.parse(t), false); // false = ne pas ré-écrire sur disque
          loaded++;
        } catch {
          // ligne corrompue ignorée
        }
      }
    }
    return loaded;
  }

  add(msg) {
    this._insert(msg, true);
  }

  _insert(msg, persist) {
    if (!msg || !msg.id) return;
    if (this.seen.has(msg.id)) return;
    this.seen.add(msg.id);
    this.messages.push(msg);
    // Tri chronologique (l'historique peut arriver dans le désordre)
    this.messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    // Écriture disque AVANT le cap mémoire, pour ne rien perdre de l'archive
    if (persist && this.file) {
      try {
        fs.appendFileSync(this.file, JSON.stringify(msg) + "\n");
      } catch {
        // échec d'écriture non bloquant
      }
    }
    if (this.messages.length > this.max) {
      const removed = this.messages.splice(0, this.messages.length - this.max);
      for (const r of removed) this.seen.delete(r.id);
    }
  }

  recent(limit = 50) {
    const n = Math.max(1, Math.min(limit, this.messages.length));
    return this.messages.slice(-n);
  }

  size() {
    return this.messages.length;
  }

  persisted() {
    return !!this.file;
  }
}
