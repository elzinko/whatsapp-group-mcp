// Utilitaire en ligne de commande : affiche les groupes WhatsApp du compte appairé.
// Dépannage / vue d'ensemble hors LLM — l'usage normal est de demander à son LLM
// « liste mes groupes » (outil list_groups) puis « autorise <nom> » (grant_channel).
//
// ATTENTION : un seul process Baileys peut utiliser la session à la fois.
// Coupe `npm start` avant de lancer ce script, sinon les deux se déconnectent mutuellement.

import { config } from "../src/config.js";
import { Settings } from "../src/settings.js";
import { WhatsAppClient } from "../src/whatsapp.js";

const settings = new Settings(config.settingsFile).load();
const wa = new WhatsAppClient(config, settings);

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

console.log("\nGroupes trouvés :\n");
for (const g of groups) {
  const mark = g.granted ? "  <-- autorisé en lecture" : "";
  console.log(`  ${g.subject}`);
  console.log(`      ${g.id}  (${g.participants ?? "?"} membres)${mark}\n`);
}
console.log(`Total : ${groups.length} groupe(s).`);
console.log(
  "Pour autoriser un groupe, demande à ton LLM : « autorise le groupe <nom> » (outil grant_channel).\n"
);

process.exit(0);
