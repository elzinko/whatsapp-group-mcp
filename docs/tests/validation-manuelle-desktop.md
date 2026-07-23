# Test manuel — validation en conditions réelles (Claude Desktop / Cowork / Code)

Ce qu'on vérifie ici ne peut **pas** l'être par un test automatisé : prouver qu'un
**humain** a bien vu — et pu refuser — une question rédigée par le serveur. Un test qui
répond au formulaire serait un robot (cf. `test/elicitation.js`, qui couvre tout le reste).

- **Valide** la fiche [0001](../../features/0001-valider-adr-0002-conditions-reelles.md) (P0) — action 8 de l'[ADR-0002](../adr/0002-le-plafond-et-le-consentement.md).
- **Décide** la fiche [0008](../../features/0008-repli-sans-elicitation-fail-open.md) (P1) : selon le résultat du **Test A**, le repli sans élicitation devient un sujet critique ou un non-sujet.

> ⏱️ Compter ~10 min par client. Le **Test A** seul (2 min) suffit à trancher l'essentiel.

---

## Phase 0 — Vérifier que le MCP est branché *(par client, à faire en premier)*

Un test ne veut rien dire si le client n'est pas relié au serveur. Et chaque client se
configure **à un endroit différent**. Le branchement est correct si, dans le client,
l'assistant a accès aux 5 outils (`whatsapp_status`, `list_groups`, `grant_channel`,
`revoke_channel`, `get_recent_messages`). Test le plus simple : demander « quel est le
statut WhatsApp ? » — s'il répond, c'est branché ; s'il dit ne pas avoir l'outil, non.

### Claude Code
- **Vérifier :** `claude mcp list` (doit lister `whatsapp-group`), ou demander le statut en session.
- **Configurer si absent :**
  ```bash
  claude mcp add whatsapp-group -- node /CHEMIN/ABSOLU/VERS/whatsapp-group-mcp/src/index.js
  ```

### Claude Desktop
- **Le bon endroit** (confirmé) : `~/Library/Application Support/Claude/claude_desktop_config.json`,
  clé `mcpServers`. Le README dit vrai.
- ⚠️ **Éditer Desktop COMPLÈTEMENT QUITTÉ** (Cmd-Q, pas juste fermer la fenêtre). L'app
  **réécrit ce fichier en direct** : une édition faite pendant qu'elle tourne est **effacée**.
  C'est la cause la plus probable d'un ajout « qui ne tient pas ». Quitter → éditer → rouvrir.
- **Configurer** — fusionner ce bloc **dans** `mcpServers`, sans toucher aux serveurs déjà présents :
  ```json
  "whatsapp-group": {
    "command": "/opt/homebrew/bin/node",
    "args": ["/CHEMIN/ABSOLU/VERS/whatsapp-group-mcp/src/index.js"]
  }
  ```
  Un écart **volontaire** avec le bloc du README, propre à cette machine : **`command` =
  chemin absolu vers node**, pas `"node"`. Desktop lance les serveurs MCP avec un PATH
  minimal **sans nvm ni Homebrew** ; `"node"` seul échouerait (« node introuvable »).
  `/opt/homebrew/bin/node` est un chemin stable. **Pas de `WHATSAPP_AUTH_DIR`** : Desktop
  partage le `./auth` déjà appairé (voir ci-dessous).
- ⚠️ **Un seul client sur `./auth` à la fois** (décision de conception du 18/07 : un unique
  dossier auth partagé, capture au fil de l'eau — deux appareils qui captent = archives en
  double). `authDir` est résolu par rapport au **repo** (`src/config.js`), donc Desktop et
  Code visent le **même** `./auth`. Avant de tester dans Desktop, libère la session :
  ```bash
  npm run stop
  ```
  (coupe aussi les serveurs lancés par les sessions Code ; ne relance pas `npm start` tant
  que Desktop est ouvert). `./auth` étant **déjà appairé** (Code s'en sert), Desktop le
  réutilise — **aucun nouveau QR à scanner**.

### Cowork
Même application que Desktop → **même** fichier de config, **même** `./auth` partagé, **même**
règle : un seul client à la fois tient la session.

> ✅ Phase 0 franchie quand « quel est le statut WhatsApp ? » renvoie un JSON (et non « je
> n'ai pas cet outil »). Passe alors à « Avant de commencer », puis aux Tests A→D.

---

## Avant de commencer

1. **Installer et appairer** — suivre le README, à la racine du dépôt :
   - [Installation](../../README.md#installation) → `npm install`
   - [Premier lancement : appairage](../../README.md#premier-lancement--appairage) → `npm start`, scanner le QR **depuis le téléphone**
   - [Brancher à Claude Desktop / Cowork](../../README.md#brancher-à-claude-desktop--cowork) → bloc `claude_desktop_config.json`

2. **Un seul process Baileys à la fois.** Deux process sur le même `auth/` se déconnectent
   mutuellement (erreur 440, appairage rasé). Avant d'ouvrir le client à tester :

   ```bash
   npm run stop
   ```

   Puis laisse **le client** (Desktop/Cowork/Code) lancer le serveur, ou lance-le à la main —
   mais **pas les deux**. Un dossier `auth/` par client (Desktop → `./auth`, Code → `./auth-code`
   via `WHATSAPP_AUTH_DIR`).

3. **Préparer deux groupes** dans `allowlist.json` (le plafond, édité à la main) :
   - **`«GROUPE_AU_PLAFOND»`** — un groupe présent dans `allowlist.json` (ex. un groupe de test à toi).
   - **`«GROUPE_HORS_PLAFOND»`** — un groupe dont tu es membre mais **absent** d'`allowlist.json`.

   Remplace les deux placeholders par des noms réels dans les prompts ci-dessous.

---

## Le relevé — à remplir

| Client | `grantConsent` relevé (Test A) | Élicitation observée (Test C) | Verdict |
|---|---|---|---|
| Claude Code | `élicitation …` | ✅ formulaire serveur (2026-07-18) | validé |
| Claude Desktop | _à relever_ | _à observer_ | _en attente_ |
| Cowork | _à relever_ | _à observer_ | _en attente_ |

---

## Test A — Statut & mode de consentement *(le relevé décisif, 2 min)*

**Prompt à coller :**

```
Quel est le statut de la connexion WhatsApp ?
```

**Ce qu'il faut regarder** — dans le JSON renvoyé par `whatsapp_status`, le champ
**`grantConsent`**. Deux valeurs possibles, et une seule mot-clé à repérer :

| Valeur du champ `grantConsent` | Ce que ça prouve |
|---|---|
| `"élicitation (formulaire rédigé par le serveur, hors de portée du LLM)"` | ✅ Le client **supporte** l'élicitation. La garantie ADR-0002 est active sur ce client. |
| `"permissions du client MCP (le client ne supporte pas l'élicitation)"` | ⚠️ Le client **ne supporte pas** l'élicitation. Sur ce client, `allowlist.json` est le **seul** contrôle — voir « Interprétation » plus bas. |

**Résultat attendu :** `connected: true`, `readOnly: true`, et le champ `grantConsent`
présent. **Note sa valeur dans le tableau du relevé.**

> Ce seul champ tranche la question restée ouverte des ADR-0001/0002 pour le client testé —
> sans même avoir à tenter un grant.

---

## Test B — Refus hors plafond

**Prompt à coller** (remplace le placeholder) :

```
Autorise le groupe WhatsApp « «GROUPE_HORS_PLAFOND» » en lecture.
```

**Ce qu'il faut regarder :** l'appel `grant_channel` doit **échouer**, avec un message
contenant « **hors du plafond** ».

**Résultat attendu** — une erreur de la forme :

> « «GROUPE_HORS_PLAFOND» » est hors du plafond. Seul l'humain peut l'y ajouter, à la main,
> dans …/allowlist.json (aucun outil ne peut le faire à sa place). Puis réessaie grant_channel.

✅ **Le plafond tient** : le LLM ne peut pas élargir son propre périmètre, quel que soit le
mode de permissions du client. C'est vrai **même si le Test A a montré « pas d'élicitation »** —
le plafond est un contrôle dur, indépendant du consentement.

---

## Test C — Grant au plafond & consentement humain *(le moment clé)*

D'abord repartir propre (le canal ne doit pas être déjà autorisé) :

**Prompt à coller :**

```
Retire l'accès au groupe « «GROUPE_AU_PLAFOND» », puis autorise-le à nouveau en lecture.
```

**Ce qu'il faut regarder :** au moment du **ré-autorise**, selon le Test A —

- **Si `grantConsent` = élicitation :** un **formulaire rédigé par le serveur** doit
  apparaître (Claude Code affiche « MCP server "whatsapp-group" requests your input »),
  avec un texte qui commence par « Le LLM demande l'accès en LECTURE au groupe WhatsApp… »
  et deux choix **Accept / Decline**. La réponse ne passe **pas** par le LLM.
  - **Accept** → `grant_channel` renvoie `{ granted: true, scope: "read" }`.
  - **Decline** → erreur « Autorisation refusée par l'humain … Le grant n'a pas été accordé. »

- **Si `grantConsent` = permissions du client :** **aucun formulaire serveur** n'apparaît.
  Le grant est accordé directement (le client peut afficher sa propre confirmation d'appel
  d'outil, mais elle est cadrée par le LLM, pas par le serveur). → **c'est exactement le
  cas de la fiche 0008.**

**Résultat attendu :** cohérent avec la valeur relevée au Test A. **Note dans le tableau si
tu as vu, ou non, le formulaire serveur.**

---

## Test D — Lecture E2E

1. **Depuis ton téléphone**, poste un message reconnaissable dans `«GROUPE_AU_PLAFOND»`
   (ex. « test E2E <heure> »).
2. **Prompt à coller :**

   ```
   Montre-moi les derniers messages du groupe « «GROUPE_AU_PLAFOND» ».
   ```

**Ce qu'il faut regarder :** `get_recent_messages` renvoie une liste où ton message
apparaît (`text`, `from`, `at`).

**Résultat attendu :** le message posté est présent. ✅ La chaîne ingestion → mémoire →
lecture fonctionne de bout en bout.

> Si le message n'apparaît pas tout de suite : l'ingestion se fait à la connexion + en
> direct. Attends quelques secondes et recommande, ou vérifie `messagesBuffered` dans
> `whatsapp_status`.

---

## Interprétation — que faire du résultat

**Cas 1 — `grantConsent` = élicitation (Test C montre le formulaire serveur).**
La fiche **0001** est bouclée pour ce client : coche le dernier critère et reporte le relevé
dans les Notes de la fiche. La fiche **0008** perd son urgence (le repli fail-open ne concerne
alors que d'hypothétiques clients sans élicitation).

**Cas 2 — `grantConsent` = permissions du client (aucun formulaire serveur au Test C).**
Alors, sur ce client :
- `allowlist.json` est ton **seul** garde-fou. Tout ce qui y est listé est lisible par le LLM
  **sans qu'on te demande rien** (`src/consent.js` accorde le grant en repli, `via: "client-permissions"`).
- **Garde le plafond serré** : n'y mets que les groupes que tu acceptes de voir passer dans un
  transcript LLM.
- Reporte le constat dans la fiche **0008** : c'est la donnée qui manquait pour trancher entre
  fail-open documenté / fail-closed / fail-open journalisé.

Dans **les deux cas**, le Test B (refus hors plafond) doit passer : si un canal hors plafond
était autorisé, c'est un bug de sécurité à remonter immédiatement.

---

## Où reporter

- Cocher les critères et coller le relevé dans [features/0001](../../features/0001-valider-adr-0002-conditions-reelles.md) (Notes).
- Si **Cas 2** sur un client réel : l'écrire dans [features/0008](../../features/0008-repli-sans-elicitation-fail-open.md) (Contexte).
- Fait notable côté sécurité → mémoire projet (`whatsapp-mcp-security-model`).

---

## Annexe — Prompt pour piloter le test depuis une session cliente

À coller dans la session du client testé (Desktop, Cowork, ou Code). Réglages recommandés,
à faire **dans l'UI** du client avant de coller (le texte du prompt ne peut pas les changer) :
**modèle Opus 4.8**, **réflexion étendue désactivée**. Sur cette tâche, plus d'effort ≠ mieux :
ce qu'on veut, c'est une session qui s'arrête et pose la question, pas une qui comble les trous.

```text
[Config à régler dans l'UI du client AVANT de coller : modèle Opus 4.8, réflexion étendue désactivée. Non modifiable par ce texte.]

Tu es mon copilote de TEST MANUEL du serveur MCP « whatsapp-group ». On valide que le consentement humain fonctionne en conditions réelles. Déroule les étapes UNE PAR UNE, dans l'ordre, et ARRÊTE-TOI à chaque point de contrôle pour me poser la question puis attendre ma réponse.

RÈGLES ABSOLUES (ne les enfreins jamais) :
1. Tu ne vois NI le dialogue de consentement du client, NI mon téléphone. Pour tout ce que moi seul peux observer, tu me le DEMANDES et tu attends ma réponse. Tu n'inventes JAMAIS ma réponse, tu ne supposes jamais qu'un formulaire est apparu, tu ne supposes jamais qu'un message a été posté.
2. Une étape à la fois. Après chaque appel d'outil, montre-moi le champ pertinent du résultat, puis STOP et attends-moi.
3. N'accepte, ne valide, ne « passe à la suite » jamais tout seul. C'est moi qui autorise chaque étape.
4. Si un outil renvoie une erreur, colle-moi le texte EXACT de l'erreur. Ne réessaie pas en silence.
5. Ce serveur est en lecture seule. Tu n'envoies aucun message WhatsApp (l'outil n'existe pas). Tu ne modifies pas allowlist.json.

— Phase 0 (branchement) —
AVANT tout, vérifie que tu as bien accès aux outils du serveur « whatsapp-group » : whatsapp_status, list_groups, grant_channel, revoke_channel, get_recent_messages.
• Si tu NE les as PAS : n'essaie rien d'autre. Dis-moi que le MCP n'est pas branché dans ce client, et donne-moi la marche à suivre pour Claude Desktop :
   1. Quitter COMPLÈTEMENT Desktop (Cmd-Q) — l'app réécrit sa config en direct, une édition faite app ouverte est effacée.
   2. Éditer « ~/Library/Application Support/Claude/claude_desktop_config.json » et fusionner, sous la clé mcpServers (sans toucher aux serveurs déjà présents), le bloc :
        "whatsapp-group": {
          "command": "/opt/homebrew/bin/node",
          "args": ["/CHEMIN/ABSOLU/VERS/whatsapp-group-mcp/src/index.js"]
        }
   3. Rouvrir Desktop.
  Rappelle-moi : « command » doit être un chemin absolu vers node (Desktop n'a ni nvm ni Homebrew dans son PATH, un « node » nu échouerait) ; PAS de WHATSAPP_AUTH_DIR (Desktop partage le ./auth déjà appairé par Claude Code) ; et un seul client à la fois tient la session ./auth (sinon 440) — donc couper les serveurs Code avec « npm run stop » avant de tester dans Desktop. Ensuite STOP.
• Si tu les as : dis « MCP branché » et passe au Test A.

— Test A (statut & mode de consentement) —
Appelle whatsapp_status. Vérifie « connected: true » (sinon dis-moi d'appairer via npm start, et stop).
Montre-moi la valeur EXACTE du champ « grantConsent ». Puis dis-moi lequel de ces deux cas s'applique :
  • contient « élicitation » → le client SUPPORTE l'élicitation (garantie ADR-0002 active).
  • contient « permissions du client MCP » → le client ne la supporte PAS (allowlist.json sera le seul contrôle).
Note-le. STOP, attends mon « ok ».

— Préparation des noms de groupes —
Appelle list_groups et montre-moi les groupes du plafond. Demande-moi :
  (a) le nom d'UN groupe DU plafond que je veux utiliser pour le test ;
  (b) le nom d'un groupe DONT JE SUIS MEMBRE mais ABSENT du plafond (il n'apparaîtra pas dans list_groups, c'est normal — c'est moi qui te le donne).
STOP, attends mes deux réponses.

— Test B (refus hors plafond) —
Appelle grant_channel sur le groupe HORS plafond que je t'ai donné. Attendu : une ERREUR contenant « hors du plafond ». Montre-moi le message exact et confirme que c'est bien un refus. STOP, attends mon « ok ».

— Test C (consentement humain — le moment clé) —
Annonce-moi d'abord ce qui va se passer : tu vas retirer puis ré-autoriser le groupe DU plafond ; SI mon client supporte l'élicitation, un formulaire rédigé par le serveur va apparaître DANS le client, et c'est MOI qui dois le lire et cliquer Accept ou Decline.
Puis appelle revoke_channel, puis grant_channel sur ce groupe.
Ensuite DEMANDE-MOI, sans rien présumer :
  « As-tu vu un formulaire s'afficher ? Si oui, recopie son texte et dis-moi quels boutons il proposait. Si non, dis-le. »
Attends ma réponse. Ne conclus rien avant. STOP.

— Test D (lecture E2E) —
Demande-moi de poster MAINTENANT un message reconnaissable (ex. « test E2E » + l'heure) dans le groupe du plafond, depuis mon TÉLÉPHONE, et d'attendre quelques secondes. Attends que je te dise « c'est posté ».
Ensuite appelle get_recent_messages sur ce groupe et montre-moi si mon message apparaît (texte, expéditeur, heure). STOP.

— Synthèse —
Remplis ce tableau avec ce qui a été RÉELLEMENT observé (et rien d'autre) :
  | Test | Observé | Attendu | Verdict |
Puis donne le verdict global :
  • Cas 1 (élicitation + formulaire vu au Test C) → fiche 0001 bouclée pour ce client.
  • Cas 2 (permissions client + aucun formulaire) → allowlist.json est le seul garde-fou ; à reporter dans la fiche 0008.
Termine par un court paragraphe « à recopier dans la fiche » — en séparant clairement ce que TU as observé via les outils de ce que MOI je t'ai rapporté.
```

Rappel du pré-vol (à faire dans un terminal **avant** d'ouvrir le client, le prompt ne peut
pas le faire) : `npm run stop`.
