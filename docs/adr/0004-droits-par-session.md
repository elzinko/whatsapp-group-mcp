# ADR-0004 : Droits par session — un jeton porté, un périmètre ouvert par un doigt

**Statut :** Accepté
**Date :** 2026-09-05
**Décideurs :** Thomas (propriétaire du projet et du compte WhatsApp)
**Amende :** ADR-0002 (les sessions s'ajoutent au plafond et au consentement ; le reste de
0002 et 0003 survit intact) — se compose avec l'ADR-0003 (Touch ID)
**Feature :** [20260902223310499](../../features/20260902223310499_droits-par-session-jeton-porte.md)

## Contexte

Les grants (`settings.json`) sont **globaux** : tout client et toute conversation lisent
les mêmes groupes. Sous Desktop/Cowork, plusieurs conversations partagent **une seule**
connexion MCP, que le protocole ne sait pas distinguer (aucun identifiant de conversation
n'est transmis, constat repris de `google-mcp-multi-account`). Une tâche Cowork « résume le
groupe famille » pouvait donc aussi voir la copro. Le seul moyen robuste de séparer des
conversations sur une même connexion : un **jeton porté dans chaque appel**.

## Décision

### 1. Un registre de sessions, hors du domaine

Nouveau module `src/sessions.js` : une classe `SessionRegistry(dir)` qui persiste un
fichier par jeton (`sessions/<id>.json`) et porte la logique pure (création, résolution,
TTL, purge). Même convention que `Settings`/`Allowlist` : classe + chemin injecté,
testable sur un tmpdir. **Le domaine `whatsapp.js` reste inchangé** : il connaît toujours
le grant et le plafond, jamais les sessions. `src/index.js` compose les deux — la session
est un filtre appliqué **en amont**, dans la couche application, avant d'appeler
`recentFor(jid, limit)` comme aujourd'hui.

### 2. Le jeton est un paramètre explicite, pas un état de process

Paramètre `session` dans l'`inputSchema` des outils : **requis** sur
`get_recent_messages`, **optionnel** sur `list_groups` et `whatsapp_status`. Écarté :
`_meta` MCP (hors du schéma, le LLM ne sait pas le porter) et un outil `select_session`
(état global de process — exactement le bug que corrige cette fiche sous Desktop).

### 3. `session_open` : deux gestes, pas un

`session_open(channels[], ttl?)` exige `channels ⊆ grants ∩ plafond`, vérifié **avant**
tout prompt. Capter (`grant_channel`, persistant, machine-wide) et ouvrir
(`session_open`, éphémère, propre à la conversation) restent deux gestes distincts : un
seul doigt pour les deux brouillerait ce que l'humain autorise.

### 4. Consentement composé, sans repli permissions

`buildSessionConsent` (nouveau, `src/consent.js`) compose `checkPresence`/l'élicitation
comme `buildGrantConsent` (ADR-0003), avec **une différence volontaire** : drapeau
strong-auth OFF **et** client sans élicitation ⇒ **fail-closed**. Pas de repli
« permissions du client » (fiche 0008) : un grant est déjà borné par le plafond, une
session **ouvre un périmètre neuf**, elle mérite une garantie plus forte. Le motif nomme
les groupes et la durée.

### 5. Cycle de vie : TTL et purge paresseuse, pas de timer

`sessions/<id>.json` = `{ id, channels, createdAt, expiresAt, lastSeenAt }`. Jeton opaque
128 bits (`crypto.randomBytes(16)`). Dossier `0700`, fichiers `0600`, écriture atomique
tmp+rename. TTL défaut 8h (`WHATSAPP_SESSION_TTL_MS`). **Purge paresseuse à la
résolution** : un jeton expiré est supprimé et refusé sur-le-champ, sans balayage à
attendre. Balayage opportuniste en plus sur `session_open` et `whatsapp_status`. Pas de
timer : chaque client lance son propre process, un timer mourrait avec lui.
**La déconnexion MCP ne purge rien** — le jeton est au porteur, MCP ne transmet aucun id
de conversation ; sous Desktop, une connexion porte plusieurs conversations, purger à la
déconnexion tuerait les voisines. Révocation : `session_close`, ou CLI humaine
`npm run sessions -- list|close <id>|close --all`, effective immédiatement (source de
vérité = fichier).

### 6. Défense en profondeur : session ET plafond, à chaque lecture

`get_recent_messages` vérifie que le canal demandé est dans le périmètre de la session,
**puis** délègue à `recentFor(jid, limit)` **inchangé**, qui re-vérifie `grant ∩ plafond`
**courant**. Un canal retiré du plafond après l'ouverture d'une session est donc suspendu
même en session (ADR-0002 inchangé, la session empile juste sa propre garde).

## Conséquences

**Plus sûr**
- Isolation entre conversations sur une connexion partagée (Desktop/Cowork).
- Le reçu Touch ID/élicitation nomme exactement ce qu'il ouvre (groupes + durée).
- Deux gestes distincts (capter/ouvrir) : pas d'ambiguïté sur ce qui est persistant.

**Rupture assumée**
- `get_recent_messages` sans jeton **refuse** désormais, avec un message qui guide vers
  `session_open`. Le consommateur scripté (`elzinko/elzinko`) obtient un jeton longue
  durée via la CLI humaine (`npm run sessions -- open`).

**Inchangé**
- Le domaine `whatsapp.js` (grant, plafond, ingestion) n'a pas bougé.
- `grant_channel`/`revoke_channel` inchangés.

**À revisiter**
- Le jeton **sélectionne un périmètre**, il n'authentifie personne (ADR-0002 : « un jeton
  local, c'est du théâtre ») — borné par TTL court, scope minimal, révocation immédiate,
  plafond re-vérifié à chaud. Ne protège pas une machine compromise, ni un transcript qui
  fuite le jeton (rejouable jusqu'à expiration/révocation).
- Migration vers un démon unique (0005) : le registre `sessions/` déménage **tel quel**
  (même format, même jeton, même logique). Le consentement reste dans le frontend, au
  plus près du client.
- v2 signé (élicitation liée au payload, fiche 0007) : différé tant qu'aucune écriture
  n'existe.

## Actions

1. [x] `src/sessions.js` — `SessionRegistry(dir)` : create/resolve/close/list, purge
       paresseuse + opportuniste, fail-closed sur fichier corrompu.
2. [x] `src/config.js` — `sessionsDir` + `WHATSAPP_SESSIONS_DIR`, `sessionTtlMs` +
       `WHATSAPP_SESSION_TTL_MS`.
3. [x] `src/consent.js` — `buildSessionConsent({ isStrongAuthEnabled, checkPresence,
       isElicitationSupported, server, humanDuration, log })`.
4. [x] `src/index.js` — `session_open`/`session_close`, `session` requis sur
       `get_recent_messages`, optionnel sur `list_groups`/`whatsapp_status`.
5. [x] `.gitignore` — `sessions/`.
6. [x] `scripts/sessions.js` + `npm run sessions` — `list`, `close <id>`, `close --all`,
       `open --channels <jids> --ttl <durée>`.
7. [x] `test/sessions.js` — registre pur, consentement composé, protocole MCP réel
       (spawn), ajouté à `npm test` et `npm run test:sessions`.
8. [x] README + `whatsapp_help` — nouveau flux, section Sessions.
9. [ ] Relevé manuel : le prompt Touch ID nomme les groupes et la durée, constaté depuis
       Code **et** Desktop/Cowork (déféré — non automatisable par construction).
