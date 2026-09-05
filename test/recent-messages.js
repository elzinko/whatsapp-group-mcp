// Contrat de projection de get_recent_messages (fiche 20260903085814506).
// Garantit que la réponse expose `id` (identifiant WhatsApp natif, pour une ingestion
// idempotente) SANS changer les champs existants (compatibilité des clients actuels).
// Hermétique : aucune connexion WhatsApp, aucun fichier — on teste la fonction pure.

import { toRecentMessage } from "../src/whatsapp.js";

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

// Un record interne tel que toRecord() le produit (src/whatsapp.js).
const record = {
  id: "3EB0ABCDEF1234567890",
  groupId: "123@g.us",
  sender: "33600000000@s.whatsapp.net",
  fromMe: false,
  pushName: "Alice",
  text: "coucou",
  timestamp: 1_700_000_000,
};

const wire = toRecentMessage(record);

// Le cœur de la fiche : l'id natif sort, stable et non dérivé.
check("id exposé, égal à key.id", wire.id === "3EB0ABCDEF1234567890");

// Compatibilité : les champs existants restent identiques.
check("from = pushName quand présent", wire.from === "Alice");
check("sender inchangé", wire.sender === "33600000000@s.whatsapp.net");
check("fromMe inchangé", wire.fromMe === false);
check("text inchangé", wire.text === "coucou");
check("at = ISO du timestamp", wire.at === "2023-11-14T22:13:20.000Z");

// Repli connu : sans pushName, from retombe sur sender.
const anon = toRecentMessage({ ...record, pushName: null });
check("from retombe sur sender sans pushName", anon.from === record.sender);

// Pas de fuite de champ interne (groupId/timestamp ne traversent pas la surface).
check("groupId non exposé", !("groupId" in wire));
check("timestamp brut non exposé", !("timestamp" in wire));

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
