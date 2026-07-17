# ADR-0001 : Modèle d'accès aux canaux WhatsApp

**Statut :** Accepté
**Date :** 2026-07-17
**Décideurs :** Thomas (propriétaire du projet et du compte WhatsApp)

## Contexte

Le serveur expose aujourd'hui **un seul groupe**, figé dans `.env` (`WHATSAPP_GROUP_ID`
ou `WHATSAPP_GROUP_NAME`). C'est l'argument de sécurité du README (« double verrou »).

Le besoin réel est autre : piloter **plusieurs discussions** depuis des sessions LLM
(notamment Claude Cowork), sans éditer `.env` ni redémarrer entre chaque changement de
sujet. Le flux actuel (couper le serveur → `npm run list-groups` → copier le JID → éditer
`.env` → relancer) est rédhibitoire à l'usage.

### Ce que protège réellement ce projet

Recadrage important, qui pilote tout le reste de cet ADR : **les grants ne sont pas un
contrôle d'accès, c'est de la minimisation de données.**

Le compte WhatsApp appairé peut déjà lire tous ses groupes ; Thomas y a accès dans son
téléphone. Le grant n'empêche donc aucun attaquant d'atteindre quoi que ce soit. Ce qu'il
empêche, c'est que des **groupes privés se retrouvent dans un contexte / transcript LLM**
sans intention explicite.

Conséquence directe : un grant erroné n'est **pas une brèche**, c'est du bruit non désiré.
La sévérité est faible. Cela autorise un design pragmatique là où un design paranoïaque
serait injustifié — **tant que le serveur reste en lecture seule**.

### Forces en présence

- **Contenu non fiable.** Les messages WhatsApp sont de la donnée hostile par défaut
  (prompt injection). Un message piégé peut tenter d'induire un élargissement d'accès.
- **Surface d'approbation.** Une approbation n'a de valeur que si le texte lu par l'humain
  est **rédigé par le serveur**. Rédigé par le LLM, il peut mentir sur son objet.
  Le dialogue d'approbation d'outil du client MCP affiche les arguments réels
  (`120363…@g.us`) : véridiques mais **opaques** — l'humain ne peut pas savoir de quel
  groupe il s'agit. Un code de confirmation ne prouve que l'existence de la demande, pas
  son objet. **Sans surface rédigée par le serveur, l'approbation informée est
  impossible.** (Piste : elicitation MCP — capability à vérifier.)
- **Lecture seule (décidé).** Pas de `send`. Cela supprime le canal d'exfiltration
  « lire A → poster dans B » et fait chuter les enjeux de l'approbation.
- **`auth/` est effacé au logout** (`whatsapp.js:148`) : inutilisable pour stocker de la
  configuration, elle serait perdue au premier `loggedOut`.
- **`data/`** est l'archive JSONL des messages ; `dataFileFor(jid)` (`config.js:70`)
  produit **déjà** un fichier par canal. La structure disque est prête pour le multi-canal.
- **`stdout` est réservé au JSON-RPC MCP.** Tout affichage passe par `stderr` — donc
  invisible depuis Cowork.
- **Lecture séquentielle.** Le LLM lit un canal à la fois puis corrèle. L'ensemble des
  droits peut contenir N ; l'opération de lecture en prend 1.

## Décision

Remplacer le groupe unique figé en `.env` par un **ensemble de canaux autorisés
(« grants ») en LECTURE SEULE**, persisté dans `settings.json`, pilotable depuis la
conversation via des outils MCP, et revérifié au démarrage.

1. **Unité d'autorisation** = un JID de groupe + une portée. Aujourd'hui une seule portée
   existe : `read`. La portée est explicite dès maintenant, précisément pour que `send`
   ne puisse jamais arriver par extension d'un grant de lecture.
2. **Persistance** = `settings.json` à la racine du projet (gitignored), surchargeable par
   `WHATSAPP_SETTINGS_FILE`. Ni `auth/` (effacé au logout) ni `data/` (archive).
3. **Ingestion** = `granted.has(jid)` remplace `jid === groupId`. Rien d'un canal non
   autorisé n'entre en mémoire ni sur disque — la 1re barrière est conservée, élargie d'un
   singleton à un ensemble.
4. **Store** = une instance `MessageStore` par canal autorisé, dans une `Map` (jid →
   store), chacune attachée à `dataFileFor(jid)`. `MessageStore` n'est pas modifié.
5. **Surface d'outils** = `whatsapp_status`, `list_groups` (le « menu » : id, nom,
   `granted`), `grant_channel`, `revoke_channel`, `get_recent_messages(channel, limit)`.
6. **`send_message` est RETIRÉ de la surface** — pas désactivé par un flag. Un outil
   présent mais éteint reste à un `.env` près d'être vivant.
7. **Revérification au démarrage** : à la connexion, les grants dont le groupe n'existe
   plus ou dont le compte n'est plus membre sont **purgés** et journalisés sur `stderr`.
8. **Approbation** : le gate est le dialogue d'approbation d'outil du client MCP.
   Faiblesse connue et **acceptée** (voir Compromis), tolérable uniquement en lecture
   seule. Upgrade vers l'elicitation dès que la capability est confirmée.

## Options considérées

### Option A — Étendre `.env` à une liste de JID

`WHATSAPP_GROUP_IDS=a@g.us,b@g.us`

| Dimension | Évaluation |
|---|---|
| Complexité | Faible |
| Coût | ~1 h |
| Ergonomie | **Nulle** — ne résout pas le problème posé |
| Sécurité | Excellente (config as code) |

**Pour :** trivial ; le périmètre reste hors de portée du LLM.
**Contre :** ne répond pas au besoin — il faut toujours éditer un fichier et redémarrer
entre deux sujets. C'est le problème d'origine, avec des virgules.

### Option B — Grants persistés, mutables par outil MCP *(retenue)*

| Dimension | Évaluation |
|---|---|
| Complexité | Moyenne |
| Coût | ~1 j |
| Ergonomie | **Forte** — « liste mes groupes » / « prends celui-là », zéro reconfiguration |
| Sécurité | Correcte **en lecture seule** ; insuffisante si `send` revenait |

**Pour :** répond exactement au besoin ; le grant persiste donc Cowork n'est jamais
reconfiguré ; `set`/`revoke` deviennent l'implémentation naturelle d'un futur modèle de
demande/validation.
**Contre :** le LLM peut élargir son propre périmètre de lecture ; l'approbation via le
dialogue client montre un JID opaque.

### Option C — Grants hors-bande uniquement (`npm run grant`)

| Dimension | Évaluation |
|---|---|
| Complexité | Faible |
| Coût | ~½ j |
| Ergonomie | Faible — retour au terminal, invisible depuis Cowork |
| Sécurité | **Maximale** — le LLM ne peut pas s'auto-élargir |

**Pour :** le périmètre est structurellement hors de portée du LLM ; l'approbation est
rédigée par le serveur, dans un terminal que Thomas contrôle.
**Contre :** contredit frontalement « validé quand je communique avec mon LLM » et le flux
Cowork. Le remède est plus lourd que le mal, pour une sévérité faible.

### Option D — Aucun grant : lecture libre de tous les groupes

| Dimension | Évaluation |
|---|---|
| Complexité | **Minimale** — on retire du code |
| Coût | ~2 h |
| Ergonomie | Maximale |
| Sécurité | Aucune minimisation |

**Pour :** l'option « et si on enlevait ? ». Défendable : le compte peut déjà tout lire,
donc le grant ne protège de personne.
**Contre :** chaque session Cowork pourrait aspirer l'intégralité des groupes privés dans
son contexte. C'est précisément ce que le projet veut éviter. **Rejetée**, mais elle
définit utilement la ligne de base : ce que la complexité de B doit justifier.

## Analyse des compromis

**B vs D — pourquoi payer la complexité des grants ?** Parce que la valeur du projet n'est
pas le contrôle d'accès (D a raison sur ce point) mais la **minimisation**. B garde les
groupes non pertinents hors du contexte LLM. C'est le produit.

**B vs C — le point dur.** C est strictement plus sûr : le LLM ne peut pas s'auto-élargir.
B accepte qu'il le puisse. Ce compromis n'est défendable que sous **trois conditions
cumulatives**, qui doivent toutes rester vraies :

1. **Lecture seule.** Pas d'exfiltration possible via ce serveur.
2. **Données propres à l'utilisateur.** Le pire cas est que Thomas voie ses propres
   messages — pas une fuite vers un tiers.
3. **Ingestion filtrée.** Un canal non autorisé ne touche jamais le disque ni la mémoire.

**Si l'une des trois tombe, B n'est plus acceptable et il faut basculer sur C ou sur
l'elicitation.** La réintroduction de `send` fait tomber la n°1 — c'est écrit noir sur
blanc ci-dessous.

**Faiblesse assumée.** Le dialogue d'approbation du client affiche un JID opaque : Thomas
approuve sans pouvoir vérifier de quel groupe il s'agit. Mitigations retenues : le serveur
**résout lui-même** le nom depuis Baileys (jamais celui passé par le LLM) et le journalise
sur `stderr`, et le renvoie dans le résultat de l'outil. Ce n'est **pas** une approbation
informée fiable — c'est une trace vérifiable *a posteriori*. Acceptable en lecture seule
sur ses propres données. Rien de plus.

## Conséquences

**Ce qui devient plus simple**
- Changer de sujet : une phrase dans la conversation, plus d'édition de `.env` ni de
  redémarrage.
- Cowork : configuré une fois, les grants persistent d'une session à l'autre.
- L'archive disque est déjà par canal — pas de migration de données.

**Ce qui devient plus difficile**
- Le README perd son argument « double verrou / un seul groupe ». Il **doit** être réécrit
  honnêtement : la garantie est désormais « lecture seule, canaux explicitement approuvés,
  ingestion filtrée ».
- Le LLM peut élargir son périmètre de lecture. Assumé, sous les 3 conditions ci-dessus.
- `MessageStore` passe de 1 à N instances : le plafond mémoire devient
  `maxMessages × canaux`. À surveiller si le nombre de grants grandit.
- Le nom du dépôt (`whatsapp-group-mcp`, singulier) devient inexact.

**À revisiter**
- **Le jour où `send` revient** — contrat non négociable posé ici :
  1. portée `send` **distincte**, jamais impliquée par un grant `read` ;
  2. approbation **rédigée par le serveur** (elicitation, ou hors-bande) — le dialogue
     d'outil du client ne suffit plus ;
  3. confirmation **par message**, pas de blanc-seing persistant ;
  4. réexamen du couple lecture large + écriture = exfiltration.
- **Plafond par session** (`WHATSAPP_CHANNELS` en env restreignant les grants pour *cette*
  session) : non construit. Le format de `settings.json` doit laisser la place à
  `effectif = grants ∩ plafond`. À confirmer avec Thomas — voir Questions ouvertes.
- **Elicitation** : si la capability est confirmée, elle remplace le gate actuel et devient
  le prérequis de `send`.

## Questions ouvertes — tranchées

1. **« Revalidé au démarrage selon la config de la session »** — **(b) retenu** :
   revérification des grants contre la réalité (groupe existant, compte toujours membre),
   plus rafraîchissement du nom des groupes renommés. Nécessaire et gratuit. **(a)** (le
   plafond par session via env) n'est **pas** construit : le format de `settings.json` est
   versionné et la portée est explicite, la place reste donc ouverte pour
   `effectif = grants ∩ plafond` sans rupture. À rouvrir si le besoin se manifeste.
2. **Renommer le dépôt** — **non**. `whatsapp-group-mcp` est inexact (singulier) mais le
   renommage est cosmétique et touche un dépôt distant. Sans valeur d'usage. À rouvrir
   s'il devient public.

## Actions

1. [x] **Log de la capability `elicitation`** au handshake (`server.oninitialized` →
       `getClientCapabilities()`, sur `stderr`). ⚠️ **Correction d'une erreur d'analyse :**
       ce test ne peut PAS être fait via le smoke test — celui-ci déclare *ses propres*
       capabilities. Seul le vrai client (Cowork / Claude Desktop) donne la réponse. Le log
       est en place ; **la mesure reste à faire par Thomas**, au premier lancement depuis
       Cowork. Elle décide de l'avenir de `send`.
2. [x] `src/settings.js` — `Settings` (load/save atomique) ; portée inconnue ignorée
       (un `settings.json` d'une version future ne peut pas accorder un droit inconnu) ;
       fichier corrompu → aucun grant (*fail closed*).
3. [x] `src/config.js` — `settingsFile` + `WHATSAPP_SETTINGS_FILE` ; `groupId`/`groupName`
       rétrogradés en **amorçage** ; `allowSend` **supprimé** (plus de drapeau d'envoi).
4. [x] `src/whatsapp.js` — `Map` de stores par canal ; ingestion sur `settings.has(jid)` ;
       `grantChannel()` / `revokeChannel()` avec validation d'appartenance ; purge et
       rafraîchissement des noms à la connexion ; `sendMessage()` **supprimée**.
5. [x] `src/index.js` — nouvelle surface ; `send_message` retiré ; `get_recent_messages`
       prend `channel` (optionnel si un seul grant).
6. [x] `.gitignore` — `settings.json` + `settings-*.json`, et `!.env.example` (le motif
       `.env.*` masquait l'exemple).
7. [x] `test/grants.js` — persistance, fail-closed, portée inconnue ignorée, barrière
       d'ingestion (canal non autorisé + discussion privée rejetés), absence d'envoi.
       `test/mcp-smoke.js` mis à jour (aucun outil d'envoi exposé).
8. [x] **README** — section sécurité réécrite (« double verrou » remplacé par
       minimisation + limite assumée du `grant_channel` par le LLM) ; libellés d'appairage
       iOS/Android **depuis le téléphone** ; code 515 documenté ; un seul process Baileys.
9. [x] `.env.example` — créé.

### Reste à faire

- [ ] **Mesurer `elicitation`** depuis Cowork (voir action 1) — prérequis de tout futur `send`.
