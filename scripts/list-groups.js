// Utilitaire en ligne de commande : affiche les groupes WhatsApp du compte appairé,
// pour trouver le JID à mettre dans WHATSAPP_GROUP_ID.
// Réutilise la session enregistrée dans ./auth (lance d'abord `npm start` pour appairer).

import { config } from "../src/config.js";
import { MessageStore } from "../src/store.js";
import { WhatsAppClient } from "../src/whatsapp.js";

const wa = new WhatsAppClient(config, new MessageStore(1));

await wa.start();

console.error("Connexion en cours… (Ctrl+C pour annuler)");

// Attend que la connexion soit ouverte, puis liste les groupes.
const deadline = Date.now() + 60000;
while (!wa.isReady() && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 500));
}

if (!wa.isReady()) {
  console.error(
    "Impossible de se connecter dans le délai. As-tu appairé le compte via `npm start` (scan du QR) ?"
  );
  process.exit(1);
}

const groups = await wa.listGroups();
groups.sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));

console.log("\nGroupes trouvés :\n");
for (const g of groups) {
  const mark = g.isAllowed ? "  <-- WHATSAPP_GROUP_ID actuel" : "";
  console.log(`  ${g.subject}`);
  console.log(`      ${g.id}  (${g.participants ?? "?"} membres)${mark}\n`);
}
console.log(`Total : ${groups.length} groupe(s).`);
console.log("Copie le JID (…@g.us) voulu dans WHATSAPP_GROUP_ID (.env), puis relance le serveur.\n");

process.exit(0);
