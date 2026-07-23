---
id: 0010
title: Installer / doctor en CLI — brancher le MCP sans se tromper (check node, chemin absolu)
type: feature
priority: P2
version:
epic:
status: todo
ready: 2026-07-22
pr:
created: 2026-07-22
---

## Contexte / Problème

Brancher le serveur sur un client à la main est source d'erreurs — vécu le 2026-07-22 :
1. Le bloc générique du README (`"command": "node"`) **échoue sous Claude Desktop** : l'app
   lance les serveurs MCP avec un PATH minimal, sans nvm ni Homebrew. Sur une machine où
   node n'est qu'en nvm/brew, le serveur ne démarre pas.
2. Éditer `claude_desktop_config.json` pendant que Desktop tourne : l'ajout est **effacé**
   (l'app réécrit le fichier en direct).
3. Rien ne vérifie que node est présent, ni à la bonne version (≥ 20).

Ces pièges sont documentés (Phase 0 de `docs/tests/validation-manuelle-desktop.md`), mais
la doc ne fait que *décrire* — l'humain exécute quand même tout à la main.

## Proposition

Une **CLI lancée par l'humain** (le geste au terminal EST le consentement — cf.
[ADR fiche 0012](0012-adr-serveur-ne-configure-pas-le-client.md) : le serveur MCP reste
read-only et **n'écrit jamais** la config d'un client) :

- **`doctor`** (lecture seule) — le jumeau exécutable de la Phase 0 : node présent et ≥ 20 ?
  chemin absolu de node résolu ? clients branchés (Desktop / Code) ? `./auth` appairé ?
  `allowlist.json` présent et lisible ? Sortie = diagnostic + warnings, **n'écrit rien**.
- **`install`** — écrit le bloc client :
  - résout le **chemin absolu** de node et l'inscrit dans `command` (règle le piège n°1) ;
  - fusion **idempotente** dans `mcpServers`, sans écraser `shopify-dev-mcp`/`render` ;
  - **refuse si Desktop tourne** (piège n°2) avec le message « quitte Desktop d'abord » ;
  - **warning** si node absent ou < 20 (piège n°3).

Cible d'abord Claude Desktop et Claude Code. Réutilise le layout d'un `bin/` (comme
google-mcp-multi-account, `bin/gwsa`).

## Critères d'acceptation

- [ ] `doctor` diagnostique sans rien modifier ; il signale node manquant / trop vieux
- [ ] `install` écrit un `command` = **chemin absolu** vers node (pas `"node"`)
- [ ] `install` **préserve** les serveurs déjà présents (idempotent, relançable)
- [ ] `install` refuse (ou avertit fortement) si Desktop est ouvert
- [ ] Aucun secret, aucune donnée privée touchée ; le serveur MCP lui-même reste read-only
- [ ] Testé : machine sans node → warning clair ; config existante → pas d'écrasement

## Notes

- **Design retenu (groom 2026-07-22)** : scripts Node sous `scripts/` (comme `stop.js`,
  `list-groups.js`), exposés en `npm run doctor` / `npm run install:client` — ESM, zéro dép.
  `doctor` **lit seulement**. `install` cible **Desktop** (écrit
  `~/Library/Application Support/Claude/claude_desktop_config.json` : **backup d'abord**,
  fusion idempotente préservant les autres serveurs, **refuse si Desktop tourne**, JSON
  malformé → refus sûr) ; pour **Code**, imprime la commande `claude mcp add` (ne pas écrire
  `~/.claude.json` à la main). Node stable résolu par ordre : `/opt/homebrew/bin/node` →
  `/usr/local/bin/node` → `/usr/bin/node` → `process.execPath` (warning si seulement nvm).
  macOS d'abord.
- Absorbe proprement l'envie « que ça se configure tout seul » (Q du 2026-07-22) **sans**
  donner au serveur un pouvoir d'écriture sur la config client — la frontière est tenue
  par [0012](0012-adr-serveur-ne-configure-pas-le-client.md).
- Précédent : `bin/gwsa` + `scripts/provision-gcp.sh` de
  `~/git/google-mcp-multi-account` (CLI humaine qui range, `execFile`, jamais
  de shell). À épouser, pas à réinventer.
- Se marie avec [0011](0011-outil-aide-mcp.md) (aide) : `doctor` en CLI, `help` en outil MCP.
