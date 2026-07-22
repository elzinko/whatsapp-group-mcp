---
id: 0011
title: Aide déclenchée — outil (et prompt) « comment j'utilise ce MCP ? »
type: feature
priority: P3
version:
epic:
status: todo
ready:
pr:
created: 2026-07-22
---

## Contexte / Problème

Quand on (re)découvre le serveur dans un client, il n'y a pas de point d'entrée « aide » :
on doit relire le README hors du client. Une réponse concise, **dans la conversation**,
sur « qu'est-ce que ce MCP et comment je m'en sers » manque.

## Proposition

Deux mécanismes MCP natifs, complémentaires :

- **Un outil `whatsapp_help`** (base portable) — renvoie une aide courte : ce que fait le
  serveur (lecture seule), les 5 outils, la notion de **plafond** (`allowlist.json`), le
  flux grant → lecture, et la note de sécurité (le LLM peut s'auto-grant dans les limites
  du plafond). Le LLM l'appelle dès qu'on demande « comment j'utilise ça ? ».
- **Un prompt MCP nommé** (confort) — exposé par Desktop en **slash-command**
  (ex. `/whatsapp-group:help`), pour ceux qui préfèrent une commande explicite.

L'outil est la base (marche partout, invocable par le LLM) ; le prompt ajoute l'UX
slash-command là où le client la supporte.

## Critères d'acceptation

- [ ] `whatsapp_help` renvoie une aide concise et à jour (outils, plafond, lecture seule)
- [ ] Le texte d'aide pointe vers le README pour le détail (pas de duplication qui périme)
- [ ] Si un prompt MCP est ajouté : il apparaît en slash-command dans un client qui les gère
- [ ] Déclaré dans les capabilities du serveur (aujourd'hui : `tools` seulement)

## Notes

- Volontairement mince : l'aide **indirige** vers le README (source de vérité), elle ne le
  recopie pas — même doctrine que le skill ezk-readme (descendre du général au particulier,
  éviter l'info volatile dupliquée).
- Complète [0010](0010-installer-doctor-cli.md) : `doctor` (diagnostic, CLI) et `help`
  (usage, outil MCP) répondent à deux questions différentes.
