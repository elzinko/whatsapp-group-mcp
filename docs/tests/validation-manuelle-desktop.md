# Test manuel — le consentement humain tient en conditions réelles (Desktop / Cowork / Code)

Ce test prouve une seule chose, mais à fond : **le LLM ne peut pas élargir seul son accès
à WhatsApp**. Chaque élargissement — capter un canal, ouvrir une session — exige un geste
**humain** que le LLM ne peut ni voir ni contrefaire : Touch ID, ou un formulaire rédigé
par le serveur. C'est exactement ce qui **ne peut pas** être automatisé : un test qui
répond au formulaire serait un robot (`test/elicitation.js`, `test/touchid.js`,
`test/sessions.js` couvrent tout le reste — le contrat, pas le geste).

Protocole calqué sur le projet frère `google-mcp-multi-account`, **sans sa dimension
admin** (WhatsApp perso n'a ni console d'organisation ni IAM). Principe partagé :

> l'outil vérifie · l'humain autorise · le LLM orchestre

- **Valide** la fiche [0001](../../features/0001-valider-adr-0002-conditions-reelles.md) (P0) — la 1re marche de l'épic « accès par session ».
- **Décide** la fiche [0008](../../features/done/0008-repli-sans-elicitation-fail-open.md) : si un client tombe en « permissions du client », le repli sans élicitation redevient un sujet.

> ⏱️ ~15 min par client. Les Phases A→C (le mode de consentement + Touch ID) tranchent
> l'essentiel en ~5 min ; D→E ajoutent la session et la lecture bout-en-bout.

## Rien ne peut casser

- **Le serveur est en LECTURE SEULE.** Aucun outil n'envoie de message : `send` n'existe
  pas. Le pire cas est de *lire* un groupe déjà au plafond.
- **Le LLM ne touche jamais au plafond.** `allowlist.json` s'édite à la main, dans un
  terminal — aucun outil ne l'écrit.
- **Une session expire seule** (8 h par défaut) ; **un grant, non** — il est persistant
  (`settings.json`) mais reste borné au plafond, et se retire avec `revoke_channel`. Le
  test finit donc par un `revoke_channel` s'il a créé le grant (Phase G).
- **Le message de test** posté depuis le téléphone reste dans ton groupe : il n'est ni
  créé ni supprimé par l'agent.

Prompt de lancement clé-en-main : voir [Annexe](#annexe--prompt-pour-piloter-le-test) en bas.

## Prérequis (humain)

1. **Installer et appairer** — README à la racine : `npm install`, puis `npm start` et
   scanner le QR **depuis le téléphone** (une seule fois ; `./auth` est ensuite réutilisé).
2. **Un seul process sur `./auth` à la fois.** Deux process sur le même dossier auth se
   déconnectent (erreur 440, appairage rasé). Avant d'ouvrir le client à tester :

   ```bash
   npm run stop      # coupe les serveurs lancés par les sessions Code
   npm run doctor    # confirme que whatsapp-group est branché dans le client visé
   ```

   Puis laisse **le client** (Desktop/Cowork/Code) lancer le serveur — **pas les deux**.
3. **Deux groupes sous la main**, dont tu remplaces les placeholders dans les prompts :
   - **`«GROUPE_AU_PLAFOND»`** — présent dans `allowlist.json` (un groupe de test à toi).
   - **`«GROUPE_HORS_PLAFOND»`** — dont tu es membre mais **absent** d'`allowlist.json`.
4. *(Optionnel — couche profil, fiche 0004)* si tu testes un projet à `WHATSAPP_PROFILE`,
   garde en tête un groupe **au plafond mais hors du profil actif** (Phase F bis).

### Brancher Claude Desktop / Cowork (le piège classique)

Desktop et Cowork partagent **le même** fichier de config et **le même** `./auth`.

- **Le bon fichier** : `~/Library/Application Support/Claude/claude_desktop_config.json`,
  clé `mcpServers`.
- ⚠️ **Éditer l'app COMPLÈTEMENT QUITTÉE** (Cmd-Q, pas juste fermer la fenêtre). L'app
  **réécrit ce fichier en direct** : une édition faite app ouverte est **effacée**. C'est
  la cause n°1 d'un ajout « qui ne tient pas ». Quitter → éditer → rouvrir.
- **Le bloc à fusionner** dans `mcpServers` (sans toucher aux serveurs présents) :

  ```json
  "whatsapp-group": {
    "command": "/opt/homebrew/bin/node",
    "args": ["/CHEMIN/ABSOLU/VERS/whatsapp-group-mcp/src/index.js"]
  }
  ```

  Écart **volontaire** avec le README, propre à cette machine : `command` = **chemin
  absolu vers node**. Desktop lance les serveurs MCP avec un PATH minimal, **sans nvm ni
  Homebrew** ; un `"node"` nu échouerait. **Pas de `WHATSAPP_AUTH_DIR`** : Desktop partage
  le `./auth` déjà appairé par Code.

## Le relevé — à remplir

| Client | Mode (`grantConsent`, Phase A) | Touch ID vu sur grant + session (C, D) | Session OK (D, E) | Verdict |
|---|---|---|---|---|
| Claude Code | élicitation (2026-07-18) | n/a (Touch ID venu après) | ✅ | validé (périmètre juillet) |
| Claude Desktop | _à relever_ | _à observer_ | _à observer_ | _en attente_ |
| Cowork | _à relever_ | _à observer_ | _à observer_ | _en attente_ |

## Déroulé (ce que l'agent doit faire)

Conventions : l'agent appelle les outils MCP `whatsapp_status`, `list_groups`,
`grant_channel`, `revoke_channel`, `session_open`, `get_recent_messages`, `session_close`.
Il **ne consent jamais lui-même** : Touch ID et élicitation sont des gestes **humains**.
Après chaque appel, il montre le champ pertinent puis **s'arrête** et attend.

### Phase 0 — branchement (état des lieux)

- Demander « quel est le statut WhatsApp ? ». Si l'agent n'a **pas** les outils → il n'est
  pas branché : appliquer « Brancher Claude Desktop / Cowork » ci-dessus, puis reprendre.
- ✅ Franchie quand `whatsapp_status` renvoie un JSON (et non « je n'ai pas cet outil »).

### Phase A — statut & mode de consentement *(le relevé décisif, 2 min)*

Prompt : `Quel est le statut de la connexion WhatsApp ?` → `whatsapp_status`.

Regarder le champ **`grantConsent`**. **Trois** valeurs possibles (Touch ID est le défaut
depuis l'ADR-0003) :

| Valeur de `grantConsent` | Ce que ça prouve |
|---|---|
| `Touch ID (présence physique — hiérarchie ADR-0003)` | ✅ Le consentement est une **présence physique**. Le LLM ne peut ni la voir ni la simuler. Garantie la plus forte. |
| `élicitation (formulaire rédigé par le serveur, hors de portée du LLM)` | ✅ Le client **supporte** l'élicitation. Le formulaire échappe au LLM (garantie ADR-0002). |
| `permissions du client MCP (le client ne supporte pas l'élicitation)` | ⚠️ Ni Touch ID ni élicitation. `allowlist.json` est alors le **seul** contrôle → fiche 0008. |

Assertions :

- [ ] `connected: true` et `readOnly: true`.
- [ ] `grantConsent` présent — **noter sa valeur** dans le relevé.
- [ ] `session: "aucune session"` et `activeSessions` = un nombre (jamais le contenu d'une session).

> Ce seul champ tranche l'essentiel pour le client testé, sans même tenter un grant.

### Phase B — refus hors plafond *(contrôle dur)*

Prompt : `Autorise le groupe WhatsApp « «GROUPE_HORS_PLAFOND» » en lecture.` → `grant_channel`.

Assertions :

- [ ] L'appel **échoue**, message contenant « **hors du plafond** » (« Seul l'humain peut
      l'y ajouter, à la main, dans …/allowlist.json »).
- [ ] **Aucun** Touch ID, **aucun** formulaire : le refus plafond précède tout consentement.
- [ ] Le plafond tient **même si la Phase A a montré « permissions du client »** — c'est un
      contrôle dur, indépendant du consentement.

### Phase C — grant au plafond & consentement humain *(le moment clé)*

Prompt : `Retire l'accès au groupe « «GROUPE_AU_PLAFOND» », puis autorise-le à nouveau en lecture.`
→ `revoke_channel` puis `grant_channel`.

Au moment du **ré-autorise**, selon la Phase A :

- **Touch ID** → une boîte macOS Touch ID apparaît. **Toi seul** la vois et la valides.
  - Empreinte acceptée → `grant_channel` renvoie `{ jid, subject, scope: "read", granted: true }`.
    La provenance (`via: "touchid"`) est **persistée** mais **ne figure pas** dans cette
    réponse : on la lit via `whatsapp_status` (fiche 0008), pas dans le retour du grant.
  - Annulée / échouée → refus « Touch ID … Le grant n'a pas été accordé » (fail-closed).
- **Élicitation** → un formulaire serveur Accept/Decline apparaît (le texte commence par
  « Le LLM demande l'accès en LECTURE au groupe WhatsApp… »). La réponse ne passe **pas**
  par le LLM. Accept → `{ jid, subject, scope: "read", granted: true }` ; Decline →
  « Autorisation refusée par l'humain ».
- **Permissions du client** → **aucun** formulaire serveur ; le grant est accordé
  directement (`via: "client-permissions"`). → **c'est le cas de la fiche 0008.**

Assertions :

- [ ] Le comportement observé est **cohérent** avec la valeur relevée en Phase A.
- [ ] **Noter dans le relevé** : as-tu vu (ou non) une boîte Touch ID / un formulaire ?

### Phase D — session : ouverture, périmètre, TTL

D'abord le contrôle négatif de la session :

Prompt : `Montre-moi les derniers messages du groupe « «GROUPE_AU_PLAFOND» ».` (sans jeton)
→ `get_recent_messages` **doit échouer** : « exige une session valide », avec l'explication
pour en ouvrir une.

Puis ouvrir la session :

Prompt : `Ouvre une session de lecture sur le groupe « «GROUPE_AU_PLAFOND» ».` → `session_open`.

Le consentement de session est **fail-closed**, à la différence du grant : ouvrir une
session crée un périmètre neuf, elle exige une garantie forte (fiche 20260902223310499).

- **Touch ID** ou **élicitation** (selon Phase A) → un **second** consentement est demandé
  (capter un canal et ouvrir une session sont **deux gestes distincts**). Accepté → l'appel
  renvoie un **jeton** et une échéance.
- **Permissions du client** (strong-auth OFF **et** pas d'élicitation) → `session_open`
  **REFUSE** : « aucun consentement vérifiable n'est disponible, la session n'est pas
  ouverte ». **Pas** de repli « permissions client » ici (contrairement au grant, fiche
  0008). Les Phases D–E **ne peuvent pas** aboutir dans ce mode : réactive le drapeau
  strong-auth (Touch ID, ON par défaut) pour les jouer, ou note que ce client s'arrête au grant.

Vérifier le périmètre : `Quel est le statut de ma session ?` en passant le jeton →
`whatsapp_status` avec `session:<jeton>` affiche `{ expiresAt, channels:[…] }`.

Assertions :

- [ ] Sans jeton, `get_recent_messages` est **refusé** (et explique comment ouvrir une session).
- [ ] Touch ID/élicitation → `session_open` demande le consentement ; jeton obtenu, `expiresAt` ≈ 8 h, `channels` corrects.
- [ ] Permissions du client → `session_open` **refuse** (fail-closed) ; le parcours session s'arrête ici.

### Phase E — lecture E2E (via la session)

1. **Depuis ton téléphone**, poste un message reconnaissable dans `«GROUPE_AU_PLAFOND»`
   (ex. « test E2E <heure> »), et attends quelques secondes.
2. Prompt : `Avec mon jeton de session, montre les derniers messages de « «GROUPE_AU_PLAFOND» ».`
   → `get_recent_messages` (jeton porté).

Assertions :

- [ ] Ton message apparaît (`text`, `from`, `at`). ✅ ingestion → mémoire → lecture, de bout en bout.

> Pas là tout de suite ? L'ingestion se fait à la connexion + en direct. Attends quelques
> secondes, ou vérifie `messagesBuffered` dans `whatsapp_status`.

### Phase F — contrôles négatifs consolidés *(les barrières tiennent)*

Chaque cas **doit échouer**, et **aucun** ne doit déclencher Touch ID/élicitation (les
refus précèdent le consentement) :

- [ ] `get_recent_messages` avec un jeton **valide** mais un canal **hors du périmètre** de
      la session → refusé.
- [ ] `get_recent_messages` **sans** jeton → refusé (déjà vu Phase D — le redire dans le bilan).
- [ ] Re-tenter le grant **hors plafond** (Phase B) → refusé, sans consentement déclenché.

### Phase F bis — couche profil *(optionnel, fiche 0004)*

Si un `WHATSAPP_PROFILE` est actif : `list_groups` renvoie `hiddenOutsideProfile > 0` pour
les groupes **au plafond mais hors du profil**, avec une note qui dit d'éditer le profil
(pas le plafond).

- [ ] Un groupe au plafond mais hors profil n'apparaît **pas** dans `list_groups` (seul son nombre).

### Phase G — nettoyage (réversible, sur accord)

- `session_close` avec le jeton → ferme la session. **Aucun** consentement supplémentaire
  (réduire est toujours permis). À défaut, la session expire seule après son TTL (8 h).
- `revoke_channel « «GROUPE_AU_PLAFOND» »` — **obligatoire** si le run a créé ou recréé ce
  grant : un grant est **persistant** (`settings.json`, survit aux redémarrages) et
  **n'expire pas**. Sans révocation, le groupe reste autorisé après le test.

L'agent ne supprime rien côté téléphone ni sur disque : le serveur est en lecture seule.

## Rejouabilité — le test est idempotent

- **Aucune écriture WhatsApp** : rien à recompter d'un run à l'autre.
- **Sessions** expirées entre deux runs : re-`session_open` est normal (TTL). Les **grants**,
  eux, **persistent** — un canal capté le reste jusqu'à `revoke_channel` (Phase G).
- **Le message de test** reste dans le groupe ; un horodatage dans le texte évite toute
  confusion entre deux runs.
- **`./auth` partagé** : un seul client à la fois (Phase Prérequis n°2).

## Critères de réussite

- [ ] Mode de consentement (`grantConsent`) relevé pour le client.
- [ ] Refus hors plafond constaté, sans consentement déclenché.
- [ ] Grant au plafond : consentement humain observé (Touch ID / formulaire / aucun — noté).
- [ ] `get_recent_messages` refusé sans jeton de session.
- [ ] `session_open` : en Touch ID/élicitation, consentement observé + jeton + `expiresAt` + périmètre corrects ; en « permissions du client », **refus** fail-closed (attendu).
- [ ] Lecture E2E réussie via la session (sauf mode « permissions du client », où la session ne s'ouvre pas).
- [ ] Aucun consentement déclenché sur un cas refusé (hors plafond, hors périmètre).
- [ ] (optionnel) Groupe hors profil masqué dans `list_groups`.

## Interprétation — que faire du résultat

- **Touch ID vu** → la garantie la plus forte tient sur ce client (ADR-0003). Le
  consentement est une présence physique, hors de portée du LLM. Coche les critères de
  la fiche 0001 pour ce client.
- **Formulaire d'élicitation vu** → la garantie ADR-0002 tient. Idem, fiche 0001.
- **Ni l'un ni l'autre (« permissions du client »)** → sur ce client, `allowlist.json` est
  ton **seul** garde-fou : n'y mets que des groupes que tu acceptes de voir dans un
  transcript LLM. **Reporte-le dans la fiche 0008** — c'est la donnée qui tranche entre
  fail-open documenté / fail-closed / fail-open journalisé.

Dans **tous les cas**, le refus hors plafond (Phase B) doit passer. S'il ne passe pas,
c'est un bug de sécurité à remonter **immédiatement**.

## Où reporter

- Cocher les critères « à mesurer » et coller le relevé dans
  [features/0001](../../features/0001-valider-adr-0002-conditions-reelles.md) (Notes),
  en séparant ce que l'**agent** a observé via les outils de ce que **toi** tu as rapporté.
- Cas « permissions du client » sur un client réel → l'écrire dans
  [features/0008](../../features/done/0008-repli-sans-elicitation-fail-open.md).
- Fait notable côté sécurité → mémoire projet (`whatsapp-mcp-security-model`).

## Dépannage

| Symptôme | Cause | Remède |
|---|---|---|
| L'ajout Desktop « ne tient pas » | Config éditée app **ouverte** (réécrite en direct) | Cmd-Q, éditer, rouvrir |
| `node introuvable` au lancement Desktop | PATH minimal, sans nvm/Homebrew | `command` = chemin absolu (`/opt/homebrew/bin/node`) |
| Déconnexion / QR redemandé / erreur 440 | Deux process sur le même `./auth` | `npm run stop`, un seul client à la fois |
| Aucune boîte Touch ID sur grant/session | strongauth désarmé, ou Mac sans capteur, ou client sans élicitation | Vérifier `grantConsent` (Phase A) ; c'est le relevé, pas un bug |
| Touch ID apparaît sur un cas **refusé** | Régression : le consentement passerait avant le contrôle plafond/périmètre | Test échoué : ouvrir une fiche backlog |
| `get_recent_messages` refusé | Pas de session, ou canal hors périmètre | `session_open` d'abord ; canal dans le périmètre |
| Le message posté n'apparaît pas | Ingestion en cours | Attendre quelques s ; vérifier `messagesBuffered` |
| L'agent propose de consentir lui-même | Interdit | Touch ID / formulaire = geste **humain**, toujours |

## Limites connues

- **Pas de test d'envoi** : le serveur est en lecture seule, aucun `send` à valider.
- **Un seul client à la fois** sur `./auth` (capture au fil de l'eau, décision du 18/07).
- **Touch ID** exige un Mac avec capteur (ou Watch / mot de passe de session en repli macOS).
- **Prouver la présence humaine ne s'automatise pas** — d'où ce protocole manuel ; le reste
  (contrats, refus, formes) est couvert par la suite `npm test`.

## Annexe — Prompt pour piloter le test

À coller dans la session du client testé. Réglages à faire **dans l'UI** du client avant de
coller (le texte du prompt ne peut pas les changer) : **modèle Opus 4.8**, **réflexion
étendue désactivée**. Sur cette tâche, plus d'effort ≠ mieux : on veut une session qui
s'arrête et pose la question, pas une qui comble les trous.

```text
[Config à régler dans l'UI AVANT de coller : modèle Opus 4.8, réflexion étendue désactivée. Non modifiable par ce texte.]

Tu es mon copilote de TEST MANUEL du serveur MCP « whatsapp-group » (LECTURE SEULE). On valide que le consentement humain fonctionne en conditions réelles. Déroule les phases UNE PAR UNE, dans l'ordre, et ARRÊTE-TOI à chaque point de contrôle pour me poser la question puis attendre ma réponse.

RÈGLES ABSOLUES (ne les enfreins jamais) :
1. Tu ne vois NI la boîte Touch ID, NI le dialogue de consentement du client, NI mon téléphone. Pour tout ce que moi seul peux observer, tu me le DEMANDES et tu attends. Tu n'inventes JAMAIS ma réponse ; tu ne supposes jamais qu'une boîte Touch ID est apparue, qu'un formulaire a été vu, ni qu'un message a été posté.
2. Une étape à la fois. Après chaque appel d'outil, montre-moi le champ pertinent, puis STOP.
3. Tu ne consens JAMAIS toi-même : Touch ID et élicitation sont MES gestes. Tu n'acceptes, ne valides, ne « passes à la suite » jamais seul.
4. Si un outil renvoie une erreur, colle-moi le texte EXACT. Ne réessaie pas en silence.
5. Serveur en lecture seule : tu n'envoies aucun message (l'outil n'existe pas), tu ne modifies pas allowlist.json.

— Phase 0 (branchement) —
Vérifie que tu as les outils : whatsapp_status, list_groups, grant_channel, revoke_channel, session_open, get_recent_messages, session_close.
• Si NON : dis que le MCP n'est pas branché dans ce client et donne-moi la marche à suivre Desktop : (1) Quitter COMPLÈTEMENT Desktop (Cmd-Q) — l'app réécrit sa config en direct ; (2) éditer « ~/Library/Application Support/Claude/claude_desktop_config.json », fusionner sous mcpServers le bloc { "whatsapp-group": { "command": "/opt/homebrew/bin/node", "args": ["/CHEMIN/ABSOLU/VERS/whatsapp-group-mcp/src/index.js"] } } ; (3) rouvrir. Rappelle : chemin absolu vers node (pas de nvm/Homebrew dans le PATH de Desktop) ; pas de WHATSAPP_AUTH_DIR ; un seul client à la fois sur ./auth (sinon 440) → « npm run stop » avant. Puis STOP.
• Si OUI : dis « MCP branché » et passe à la Phase A.

— Phase A (statut & mode de consentement) —
Appelle whatsapp_status. Vérifie connected:true et readOnly:true (sinon dis-moi d'appairer via npm start, et stop). Montre-moi la valeur EXACTE de « grantConsent » et dis lequel des 3 cas s'applique : « Touch ID » (présence physique), « élicitation » (formulaire serveur), ou « permissions du client » (allowlist seul). Note-le. STOP.

— Préparation des groupes —
Appelle list_groups et montre-moi les groupes du plafond. Demande-moi : (a) UN groupe DU plafond pour le test ; (b) un groupe DONT JE SUIS MEMBRE mais ABSENT du plafond (il n'apparaît pas dans list_groups — c'est moi qui te le donne). STOP.

— Phase B (refus hors plafond) —
Appelle grant_channel sur le groupe HORS plafond. Attendu : ERREUR contenant « hors du plafond », SANS aucune boîte Touch ID ni formulaire. Montre-moi le message exact. STOP.

— Phase C (grant au plafond — consentement) —
Annonce ce qui va se passer : tu vas retirer puis ré-autoriser le groupe DU plafond ; SELON la Phase A, une boîte Touch ID OU un formulaire serveur va apparaître, et c'est MOI qui dois l'accepter/refuser. Appelle revoke_channel puis grant_channel. Puis DEMANDE-MOI : « As-tu vu une boîte Touch ID ? un formulaire ? recopie ce que tu as vu et les boutons proposés. Sinon, dis-le. » Ne conclus rien avant ma réponse. STOP.

— Phase D (session : ouverture, périmètre, TTL) —
D'abord, appelle get_recent_messages SANS jeton sur le groupe du plafond : attendu = REFUS qui explique d'ouvrir une session. Montre-le. Puis appelle session_open sur ce groupe. DEUX cas, selon la Phase A :
• Touch ID ou élicitation → un 2e consentement est demandé ; DEMANDE-MOI ce que j'ai vu, puis montre-moi le jeton et l'échéance, rappelle whatsapp_status avec ce jeton et montre le périmètre (expiresAt, channels).
• « permissions du client » (strong-auth OFF ET pas d'élicitation) → session_open REFUSE, SANS jeton (« aucun consentement vérifiable… la session n'est pas ouverte »). N'invente PAS de jeton : consigne ce refus comme le résultat ATTENDU, SAUTE les Phases E–F (impossibles sans jeton) et enchaîne directement sur la Phase G puis la synthèse.
STOP.

— Phase E (lecture E2E via session) —
Demande-moi de poster MAINTENANT un message reconnaissable (ex. « test E2E » + l'heure) dans le groupe du plafond, depuis mon TÉLÉPHONE, et d'attendre quelques secondes. Attends mon « c'est posté ». Ensuite appelle get_recent_messages EN PORTANT le jeton et montre si mon message apparaît (texte, expéditeur, heure). STOP.

— Phase F (contrôles négatifs) —
Tente get_recent_messages avec le jeton mais un canal HORS périmètre : attendu = refus. Rappelle que sans jeton c'est aussi un refus. Aucun de ces refus ne doit déclencher Touch ID/formulaire. Montre-moi les messages exacts. STOP.

— Phase G (nettoyage — OBLIGATOIRE) —
Reviens à l'état de départ. Si une session a été ouverte en Phase D, appelle session_close avec le jeton. Puis, comme la Phase C a (ré)accordé un grant PERSISTANT (il n'expire pas, il survit aux redémarrages), appelle revoke_channel sur le groupe DU plafond pour le retirer. Montre-moi les deux résultats. (Si ce run n'a créé aucun grant, dis-le et ne révoque rien.) STOP.

— Synthèse —
Remplis : | Phase | Observé (par toi via l'outil / par moi) | Attendu | Verdict |. Puis le verdict global : Touch ID vu OU formulaire vu → fiche 0001 cochée pour ce client ; « permissions du client » + aucun formulaire → allowlist seul garde-fou → fiche 0008. Termine par un paragraphe « à recopier dans la fiche », en SÉPARANT ce que TU as observé via les outils de ce que MOI je t'ai rapporté.
```

Rappel du pré-vol (terminal, **avant** d'ouvrir le client — le prompt ne peut pas le faire) :
`npm run stop`.
