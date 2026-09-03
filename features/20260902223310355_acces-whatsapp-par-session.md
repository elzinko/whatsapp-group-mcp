---
id: "20260902223310355"
title: Accès WhatsApp par session — Cowork, Desktop et Code, chacun son périmètre (plafond ∩ profil ∩ session)
type: epic
priority: P1
version:
epic:
status: todo
ready:
pr:
created: 2026-09-03
---

# 20260902223310355 — Accès WhatsApp par session (Cowork, Desktop, Code)

**En clair.** Aujourd'hui Cowork ne voit pas le serveur WhatsApp, et dès que plusieurs
clients tournent, un seul garde la session WhatsApp. Cet épic donne à **chaque
conversation** (une tâche Cowork, un chat Desktop, une session Code) son **propre
périmètre de lecture** : ouvert par un geste humain (Touch ID), borné par le plafond,
avec une date de fin, révocable. C'est le modèle « droits par session » de
google-mcp-multi-account, adapté à un serveur en lecture seule.

**Si tu arrives frais.** Le serveur est un MCP stdio lancé par chaque client. Le *plafond*
(`allowlist.json`) est la liste des groupes que le serveur a le droit de servir, éditée à la
main. Un *grant* autorise la lecture d'un groupe du plafond. Une *session* (nouveau) est le
périmètre d'une conversation donnée.

## Contexte / Problème

Trois causes distinctes se cachent derrière « ça marche dans Code, pas dans Cowork »
(constat du 2026-09-03 sur le poste de Thomas) :

1. **Branchement.** Cowork est l'application Desktop : elle lit `claude_desktop_config.json`
   et expose ses serveurs MCP locaux aux tâches Cowork par un pont (`localMcpBridge` ; le
   journal Desktop annonce « google-multi-account: 17 tool(s) »). `whatsapp-group` n'y est
   **pas** aujourd'hui (`npm run doctor` : « ABSENT de mcpServers »). Il y était dans les
   sauvegardes de config du 19 au 28 juillet ; il a disparu depuis. Claude Code, lui, a sa
   propre config (`~/.claude.json`) où le serveur est branché.
2. **Singleton.** Une session WhatsApp = un seul process vivant par dossier `auth/`. Chaque
   client lance SON serveur : le dernier connecté gagne, les autres se retirent (440).
   Constat du jour : **8 serveurs** `src/index.js` tournaient en parallèle sur le poste, un
   seul répondait. Brancher Desktop sans régler ça ajoute un neuvième candidat. C'est la
   fiche [0005](0005-demon-frontends-mcp.md) (démon unique + frontends minces), épic frère
   et **prérequis** du multi-clients.
3. **Périmètre global.** Les grants vivent dans `settings.json`, commun à tous les clients
   et à toutes les conversations. Une tâche Cowork « résume le groupe famille » et une
   session Code « copro » voient les **mêmes** groupes. Sous Desktop/Cowork, toutes les
   conversations partagent en plus **une seule** connexion MCP : impossible de les
   distinguer côté serveur sans un jeton porté dans l'appel (leçon de l'ADR-0007 google).

S'ajoute une inconnue : l'élicitation MCP est mesurée dans Code (oui), pas dans
Desktop/Cowork ([0001](0001-valider-adr-0002-conditions-reelles.md), restant). Le garde
Touch ID ([0013](done/0013-garde-touchid-presence-grant.md)) est côté serveur, donc
indépendant du client, mais jamais constaté depuis un process lancé par Desktop (réserve
de l'ADR-0003).

## Ce que google-mcp-multi-account a déjà résolu (et ce qui change ici)

| Aspect | google-mcp-multi-account (livré, ADR-0007) | whatsapp-group-mcp (cible) |
|---|---|---|
| Identité d'une conversation | jeton émis par un geste signé (`mag session open`), **porté dans chaque appel** (`session`) | idem : le protocole MCP ne fournit pas d'id de conversation |
| Grain des droits | compte × service × opération × ressource | **canal** (JID) × lecture — une seule opération, tout est plus simple |
| Plafonds | policy compte ∩ manifeste projet ∩ session | **plafond ∩ profil projet ([0004](0004-profils-par-projet.md)) ∩ session** |
| Geste humain | élicitation signée Secure Enclave (v2) | Touch ID presence check v1 (livré, 0013) ; v2 signé = [0007](0007-elicitation-signee-touch-id.md), optionnel |
| Multi-clients | broker loopback (Phase 2A) | démon + frontends ([0005](0005-demon-frontends-mcp.md)) — nécessité fonctionnelle, pas un confort |
| Cycle de vie | TTL + révocation ; la déconnexion MCP ne purge rien | idem |
| Ce qui ne se transpose pas | policy par service, zones Drive, vault | rien de tout ça : lecture seule, données propres |

**Réponse à la question posée** (« peut-on faire comme google ? ») : **oui**, et c'est même
plus simple — une seule opération (lire), une seule ressource (le canal). Le « plugin »
google n'est pas un format spécial : c'est le serveur MCP branché dans la config Desktop
(`mag wire desktop`), plus une CLI humaine. L'emballage en plugin/marketplace est
cosmétique et vient en dernier
([20260902223310640](20260902223310640_emballage-plugin-cowork-marketplace.md)) — verdict
déjà posé en fiche 0007.

## Proposition

Un périmètre à trois couches, du plus dur au plus fin, toutes **fail-closed** :

```
plafond (allowlist.json — l'humain, à la main)
  ∩ profil du projet (0004 — déclaré par le lanceur, optionnel)
    ∩ session de la conversation (nouveau — jeton ouvert par Touch ID, TTL, révocable)
        = ce que CETTE conversation peut lire
```

Et une séparation nette de deux rôles que « grant » confond aujourd'hui :

- **Capter** (ingestion, archive `data/`) = plafond ∩ grants persistants — machine-wide,
  comme aujourd'hui, geste humain.
- **Lire** (dans une conversation) = session ⊆ ce qui est capté.

Séquence proposée (chaque étape est une fiche) :

1. **Mesurer d'abord** (hypothèse la plus risquée, 10 min, zéro code) —
   [0001](0001-valider-adr-0002-conditions-reelles.md) : brancher Desktop
   (`npm run install:client`, Desktop quitté, serveurs Code arrêtés), lancer une tâche
   Cowork, relever `grantConsent`, déclencher un grant et constater la boîte Touch ID.
2. **Droits par session** —
   [20260902223310499](20260902223310499_droits-par-session-jeton-porte.md) : jeton porté,
   `session_open` sous Touch ID, TTL, révocation, `whatsapp_status` par session. Marche dès
   un client à la fois ; utile immédiatement sous Desktop/Cowork (plusieurs conversations
   sur une connexion).
3. **Multi-clients simultanés** — [0005](0005-demon-frontends-mcp.md) (épic frère,
   prérequis) : le registre de sessions migre dans le démon ; Cowork + N sessions Code
   sans 440.
4. **Profils par projet** — [0004](0004-profils-par-projet.md) : couche statique optionnelle.
5. **Emballage plugin** —
   [20260902223310640](20260902223310640_emballage-plugin-cowork-marketplace.md) : idée,
   en dernier.

## Critères d'acceptation

- [ ] Depuis une tâche Cowork, « quel est le statut WhatsApp ? » répond (branchement constaté).
- [ ] Deux conversations ouvertes en même temps (ex. une tâche Cowork et une session Code)
      lisent des groupes **différents**, chacune dans son périmètre ; aucune ne voit celui de
      l'autre.
- [ ] Ouvrir un périmètre exige un geste humain (Touch ID nommant les groupes) ; le LLM peut
      le **demander**, jamais l'accorder.
- [ ] Un périmètre expire et se révoque sans redémarrer ; une conversation sans jeton ne lit
      rien (fail-closed).
- [ ] Le plafond reste la loi : aucun jeton ne dépasse `allowlist.json`.
- [ ] Épic clos quand 0001 (relevé Desktop/Cowork), la fiche droits par session et 0005 sont
      livrées ; 0004 et l'emballage peuvent suivre.

## Comment vérifier

- Relevé manuel Desktop/Cowork :
  [docs/tests/validation-manuelle-desktop.md](../docs/tests/validation-manuelle-desktop.md)
  (Tests A et C), tableau du relevé rempli.
- Tests hermétiques de chaque enfant (`npm test`) — voir leurs fiches.
- Scénario de bout en bout, à la main : Cowork = groupe A seulement, Code = groupe B
  seulement ; une lecture croisée est refusée.

## Brainstorm produit (grooming du 2026-09-03)

Session écrite (skill `product-brainstorming`), Thomas absent : les choix ci-dessous sont
des **propositions** ; les points à trancher sont listés à la fin.

### Cadrage

- **Qui a le problème** : Thomas seul, sur ses propres données. Situations réelles : projet
  copro dans Code, tâches Cowork ponctuelles (résumer un groupe), écriture de l'article.
  Usage **réellement parallèle** (8 serveurs constatés).
- **Modèle de nuisance** : minimisation de données, pas contrôle d'accès (README, ADR-0002).
  Adversaire : le mandataire zélé et l'injection dans un message WhatsApp. Le pire cas reste
  « lire mes propres messages dans la mauvaise conversation ».
- **Si on ne fait rien** : Cowork reste sans WhatsApp ; l'usage multi-sessions reste une
  loterie (le dernier gagne) ; tout périmètre est global.

### Options explorées

- **A. Rien de neuf** : brancher Desktop, un client à la fois, grants globaux. Base de
  comparaison.
- **B. Profil par projet** (0004) : statique, déclaré au lancement. Ne distingue pas deux
  tâches Cowork (même connexion).
- **C. Jeton par conversation porté dans l'appel** (port de l'ADR-0007) : geste humain →
  jeton (scope ⊆ plafond, TTL) → chaque outil de lecture l'exige. Distingue les
  conversations sur une connexion partagée.
- **D. Un dossier `auth/` par client** (4 appareils liés) : rejeté (archives en double,
  décision du 18/07).
- **E. Démon + frontends avec scope par process** (0005 seul) : bon pour Code (un process par
  session), insuffisant pour Cowork (un pont, une connexion).
- **F. Inversion : supprimer les grants persistants** : toute conversation repart de zéro.
  Séduisant, mais l'archive doit continuer à capter sans conversation ouverte. D'où la
  séparation capter / lire, retenue à la place de la suppression.
- **G. Emballage plugin / marketplace** : découvrabilité, zéro garantie (verdict 0007).
- **H. Nom de session fourni par le client** : n'existe pas dans MCP (constat google,
  fiche 0101). Écarté.

### Objections instruites

- « Un jeton visible du LLM, ça protège quoi ? » — Rien contre un attaquant, tout contre la
  confusion : scope ⊆ plafond, lecture seule, TTL court, révocable, et surtout **ouvert par
  un doigt qui voit le nom des groupes**. Même compromis assumé côté google.
- « Est-ce que ça vaut le coup pour des données à soi, en lecture seule ? » — Oui dès que
  deux conversations tournent en même temps, ce qui est le cas réel. Et c'est le socle du
  jour où `send` reviendrait (ADR-0001).
- « Et l'injection ? » — Un message piégé peut faire *demander* un périmètre ; seul le doigt
  l'*accorde*, et le prompt Touch ID nomme le scope (structurel, cf. 0007, décision 1).
- **Hypothèse la plus risquée** : Desktop/Cowork affichent-ils l'élicitation, et un serveur
  lancé par Desktop peut-il présenter Touch ID ? Test le moins cher : brancher, une tâche
  Cowork, Tests A + C. C'est l'étape 1.

### Convergence

- Retenu : **C**, précédé de la **mesure** (0001), suivi de **0005** pour le vrai
  multi-clients, **0004** en couche optionnelle, **G** en dernier.
- Mis de côté : D, H ; F reformulé en « séparer capter et lire ».

### À trancher par Thomas

1. **Comment le jeton arrive dans la conversation** : (a) le LLM appelle
   `session_open(channels)` → Touch ID nomme les groupes → jeton renvoyé dans le résultat
   d'outil (recommandé : pas de copier-coller, « le LLM propose, l'humain autorise ») ;
   (b) CLI humaine qui imprime un jeton à coller (à garder comme repli pour les scripts).
2. **Durée de vie par défaut** d'une session (proposition : 8 h, plus révocation explicite ;
   pas d'expiration à l'inactivité en v1).
3. **Priorité** : P1 proposée (bloque l'usage Cowork) — à confirmer.
4. **Ordre** entre la fiche droits par session et 0005 : proposition « session d'abord »
   (utile seule sous Desktop/Cowork), le démon ensuite.

## Glossaire

- **Cowork** — le mode « tâches » de l'application Claude Desktop ; il tourne dans une VM et
  voit les serveurs MCP locaux de Desktop par un pont.
- **Plafond** — `allowlist.json`, la liste des groupes servables, éditée par l'humain
  seulement (ADR-0002).
- **Grant** — autorisation persistante de capter et lire un groupe du plafond (ADR-0001),
  geste humain (Touch ID, ADR-0003).
- **Session** — périmètre d'une conversation : jeton porté dans chaque appel, scope ⊆ grants,
  TTL, révocable.
- **Frontend / démon** — architecture 0005 : un seul process tient WhatsApp, les clients
  parlent à des frontends MCP minces.

## Notes / décisions

- Constat 2026-09-03 : `grantConsent` = « Touch ID » depuis cette session Code ; serveur
  connecté, 2 canaux autorisés. Cowork : à relever (fiche 0001).
- Le serveur ne configure jamais le client
  ([0012](0012-adr-serveur-ne-configure-pas-le-client.md)) : le branchement Desktop reste
  `npm run install:client`, lancé par l'humain, Desktop quitté.
- Dépendance externe : `google-mcp-multi-account` — accès constaté le 2026-09-03
  (ADR-0007, `gateway/sessions.py`, `gateway/mcp_server.py` paramètre `session`,
  `docs/policies.md` `mag session open`).
- Décision d'architecture : voir la fiche enfant (section « Décision d'architecture ») ;
  l'ADR sera écrit au sprint qui implémente (numéro attribué à ce moment-là — la fiche 0012
  en réserve un aussi).
