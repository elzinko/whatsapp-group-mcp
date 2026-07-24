---
id: 0011
title: Aide déclenchée — outil (et prompt) « comment j'utilise ce MCP ? »
type: feature
priority: P3
version:
epic:
status: todo
ready: 2026-07-24
pr:
created: 2026-07-22
---

> **Soupape PO (journalisée) — 2026-07-24.** Fiche tirée hors ordre de priorité :
> P3, alors que les têtes 0001 (P0), 0008 (P1), 0003/0009/0012 (P2) sont encore
> non-ready. Pull explicite de l'opérateur (`/ezk-product-builder build 0011`,
> worktree dédié). Gate `ready` validé par l'humain (POC outil seul). Le prompt MCP
> slash-command reste un sous-point différé.

## Contexte / Problème

Quand on (re)découvre le serveur dans un client, il n'y a pas de point d'entrée « aide » :
on doit relire le README hors du client. Une réponse concise, **dans la conversation**,
sur « qu'est-ce que ce MCP et comment je m'en sers » manque.

## Valeur

Réduit la friction de (re)prise en main : la réponse « c'est quoi / comment je m'en sers »
arrive **dans le client**, sans sortir chercher le README. Complète [0010](done/0010-installer-doctor-cli.md) :
`doctor` répond « mon install est-elle saine ? » (diagnostic, CLI) ; `help` répond
« qu'est-ce que ça fait et comment je m'en sers ? » (usage, dans la conversation) — deux
questions distinctes, deux points d'entrée.

## Proposition

Deux mécanismes MCP natifs, complémentaires, **séquencés POC → polish** :

- **POC (base portable, obligatoire) — un outil `whatsapp_help`** — renvoie une aide courte :
  ce que fait le serveur (**lecture seule**), les 5 outils, la notion de **plafond**
  (`allowlist.json`), le flux **grant → lecture**, et la note de sécurité (le LLM peut
  s'auto-grant **dans les limites** du plafond). Le LLM l'appelle dès qu'on demande
  « comment j'utilise ça ? ». Marche dans **tout** client MCP, invocable par le LLM,
  **aucune nouvelle capability** (`tools` est déjà déclaré).
- **Polish (confort, optionnel) — un prompt MCP nommé** exposé en **slash-command**
  (ex. `/whatsapp-group:help`), pour ceux qui préfèrent une commande explicite. Ajoute la
  capability `prompts` + les handlers `ListPrompts`/`GetPrompt`. **Différable** si le POC
  suffit ou si le coût dépasse la valeur — tracé comme sous-point, **non bloquant** pour livrer.

L'outil est la base (marche partout, invocable par le LLM) ; le prompt ajoute l'UX
slash-command là où le client la supporte.

## Critères d'acceptation

**POC — outil `whatsapp_help` (Definition of Done du sprint) :**

- [ ] `whatsapp_help` apparaît dans l'inventaire `ListTools` du serveur
- [ ] Un appel renvoie une aide concise couvrant : **lecture seule**, les **5 outils**
      (`whatsapp_status`, `list_groups`, `grant_channel`, `revoke_channel`,
      `get_recent_messages`), la notion de **plafond** (`allowlist.json`), le flux
      **grant → lecture**, et la **note de sécurité** (le LLM peut s'auto-grant *dans les
      limites* du plafond)
- [ ] Le texte **indirige vers le README** (pointeur explicite) et ne le recopie pas
      (résumé stable des invariants + noms d'outils, pas de duplication du détail volatil)
- [ ] Un **test** asserte : présence dans `ListTools` **et** ancres clés dans le texte
      (lecture seule, plafond, noms des 5 outils, pointeur README) — branché dans `npm test`
- [ ] `npm test` reste vert

**Polish — prompt MCP (optionnel, différable) :**

- [ ] Si ajouté : capability `prompts` déclarée (aujourd'hui : `tools` seulement)
- [ ] Si ajouté : le prompt apparaît en **slash-command** dans un client qui les gère (ex. Desktop)

## Notes

- Volontairement mince : l'aide **indirige** vers le README (source de vérité), elle ne le
  recopie pas — même doctrine que le skill ezk-readme (descendre du général au particulier,
  éviter l'info volatile dupliquée).
- **Tension anti-duplication** : nommer les 5 outils + une ligne chacun est stable (les noms
  ne bougent pas) ; le détail (flags, exemples) reste dans le README. Le LLM voit déjà la
  description de chaque outil via `ListTools` — `whatsapp_help` donne le **modèle mental**
  (lecture seule · plafond · grant→lecture · note de sécurité) + le pointeur, pas une copie.
- Complète [0010](done/0010-installer-doctor-cli.md) : `doctor` (diagnostic, CLI) et `help`
  (usage, outil MCP) répondent à deux questions différentes.

## Definition of Ready

- **Problème** : point d'entrée « aide » absent dans le client (constaté ci-dessus). ✓
- **Valeur** : friction de (re)prise en main réduite, réponse in-conversation. ✓
- **Critères** : observables/vérifiables par test (`ListTools` + ancres du texte). ✓
- **Scope** : POC = outil `whatsapp_help` (obligatoire) ; prompt = polish (différable). ✓
- **Dépendances externes** : aucune (feature in-repo, ajout dans `src/index.js`). ✓
