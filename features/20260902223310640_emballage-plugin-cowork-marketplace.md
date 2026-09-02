---
id: "20260902223310640"
title: Emballage plugin Claude (marketplace elzinko) — skills + .mcp.json pour Cowork et Code
type: feature
priority: P3
version:
epic: "20260902223310355"
status: idea
ready:
pr:
created: 2026-09-03
---

# 20260902223310640 — Emballage plugin (Cowork / Code)

**En clair.** Un plugin Claude n'est qu'un emballage : un `plugin.json`, un `.mcp.json` qui
pointe le serveur, et des skills. Il rend le serveur installable en un clic dans Cowork et
Code, et donne au LLM des skills « comment lire un groupe ». Il n'ajoute **aucune** garantie
de sécurité (verdict fiche 0007). À faire en dernier, après le démon.

## Contexte / Problème

- Constat 2026-09-03 : les plugins Cowork installés sur le poste ont exactement la forme des
  plugins Claude Code — `.claude-plugin/plugin.json`, `.mcp.json` (`mcpServers`), `skills/`,
  `commands/`, et un `marketplace.json` pour la distribution. Exemple : le plugin
  `pdf-viewer` déclare `npx -y @modelcontextprotocol/server-pdf --stdio`.
- Le voisin google-mcp-multi-account n'a **pas** de plugin : il branche par `mag wire
  desktop|code`, et ses skills `gws-*` vivent dans `.claude/skills/` du repo.
- Desktop lance les serveurs avec un PATH minimal : `command` doit être un chemin absolu vers
  node (`/opt/homebrew/bin/node`, cf. `scripts/install-client.js`). Un `.mcp.json` de plugin ne
  sait pas résoudre ça par machine → à étudier (variable `${CLAUDE_PLUGIN_ROOT}`, script shim
  qui pose le PATH lui-même, comme `bin/google-mcp`).
- Piège : un plugin qui fait lancer un serveur par client **aggrave** la guerre de sessions
  (un process par client sur `auth/`). Prérequis : [0005](0005-demon-frontends-mcp.md) — le
  `.mcp.json` pointe un frontend mince, jamais le serveur Baileys.

## Proposition (à groomer)

- Emplacement : repo dédié `elzinko/whatsapp-mcp-plugin` (marketplace perso, comme demandé)
  ou dossier `plugin/` dans ce repo — à trancher.
- Contenu : `plugin.json`, `.mcp.json` (frontend), skills `wa-status`, `wa-read-group`,
  `wa-open-session`, une commande `/wa-help`.
- Installation : Cowork (marketplace) et `claude plugin install`.

## Critères d'acceptation (esquisse)

- [ ] Installable depuis Cowork et depuis Code sans éditer de JSON à la main.
- [ ] Ne contourne pas [0012](0012-adr-serveur-ne-configure-pas-le-client.md) : le plugin
      **déclare**, il n'écrit pas la config à la place de l'humain (l'installation d'un plugin
      est un geste humain dans l'interface).
- [ ] Aucune promesse de sécurité dans sa description.

## Comment vérifier

Installer le plugin dans Cowork, ouvrir une tâche, demander « quel est le statut
WhatsApp ? » ; même chose dans Code après `claude plugin install`.

## Notes / décisions

- Verdict 0007 (2026-07-19) : pas de « plugin Desktop » pour la sécurité ; cosmétique, ça
  peut attendre.
- Différence avec un `.mcpb` (extension Desktop, déjà utilisée par Thomas pour
  `vectorz-supervision`) : le `.mcpb` = Desktop seulement ; le plugin = Cowork + Code.
