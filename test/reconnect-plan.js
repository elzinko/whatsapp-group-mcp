// Teste la décision de reconnexion (fonction pure planReconnect), SANS WhatsApp.
// Régression : avant le correctif, un code 440 (session remplacée) relançait une
// reconnexion toutes les 2 s -> boucle infinie -> rate-overlimit. On vérifie ici
// que 440 => "giveup" (on n'insiste pas), 401 => "wipe", et que les autres codes
// se reconnectent avec un backoff exponentiel plafonné à 60 s.

import { DisconnectReason } from "@whiskeysockets/baileys";
import { planReconnect, mayWipeAuth } from "../src/whatsapp.js";

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

// 401 : identifiants invalides -> effacer la session.
check("401 loggedOut -> wipe", planReconnect(DisconnectReason.loggedOut, 1).action === "wipe");

// 440 : une autre session a pris la main -> on abandonne (LE correctif).
check(
  "440 connectionReplaced -> giveup (pas de reconnexion)",
  planReconnect(DisconnectReason.connectionReplaced, 1).action === "giveup"
);

// 515 : redémarrage demandé par WhatsApp -> reconnexion.
check("515 restartRequired -> retry", planReconnect(DisconnectReason.restartRequired, 1).action === "retry");

// Coupure réseau (statusCode indéfini) -> reconnexion aussi.
check("undefined (réseau) -> retry", planReconnect(undefined, 1).action === "retry");

// Backoff exponentiel : 2s, 4s, 8s, 16s…
check("backoff tentative 1 = 2000ms", planReconnect(515, 1).delayMs === 2000);
check("backoff tentative 2 = 4000ms", planReconnect(515, 2).delayMs === 4000);
check("backoff tentative 3 = 8000ms", planReconnect(515, 3).delayMs === 8000);
check("backoff tentative 4 = 16000ms", planReconnect(515, 4).delayMs === 16000);

// Plafond à 60 s : 2000 * 2^9 = 1 024 000 -> ramené à 60000.
check("backoff plafonné à 60000ms (tentative 10)", planReconnect(515, 10).delayMs === 60000);

// Robustesse : une tentative <= 0 ne doit pas produire un délai négatif.
check("tentative 0 -> délai >= 2000ms (pas de valeur négative)", planReconnect(515, 0).delayMs === 2000);

// --- mayWipeAuth : garde-fou du wipe sur 401 ---------------------------------
// Régression : un serveur zombie recevant un 401 tardif effaçait le dossier auth
// d'un ré-appairage EN COURS lancé par un autre process (crash ENOENT creds.json).
const ours = { registrationId: 111 };

check(
  "401 avec NOS creds sur disque -> wipe autorisé",
  mayWipeAuth(ours, JSON.stringify({ registrationId: 111 })) === true
);
check(
  "401 mais un AUTRE process a ré-appairé (registrationId différent) -> ne pas toucher",
  mayWipeAuth(ours, JSON.stringify({ registrationId: 222 })) === false
);
check("401 mais creds.json déjà absent -> rien à effacer", mayWipeAuth(ours, null) === false);
check(
  "401 avec creds.json corrompu -> nettoyage autorisé",
  mayWipeAuth(ours, "{pas du json") === true
);

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
