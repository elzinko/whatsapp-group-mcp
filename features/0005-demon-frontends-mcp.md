---
id: 0005
title: Démon unique + frontends MCP minces (phase 2 — multi-clients simultanés)
type: epic
priority: P3
version:
epic:
status: idea
ready:
pr:
created: 2026-07-18
---

## Contexte / Problème

Une session WhatsApp = un seul process vivant par dossier `auth/`. Aujourd'hui chaque
client (Desktop, chaque session Code) lance SON serveur : le dernier connecté gagne,
les autres se retirent (440 → giveup). Vécu : guerres de sessions, rate-limit,
appairage rasé. Utilisable à un client à la fois, mais structurellement bancal dès que
plusieurs consommateurs simultanés deviennent réels.

## Proposition

Un **démon unique** qui possède Baileys (session + capture + archive + plafond), et des
**frontends MCP stdio minces** que les clients lancent librement : ils parlent au démon
(socket Unix local), plus jamais à WhatsApp. Les profils par projet (0004) deviennent
des scopes de frontend. L'élicitation reste dans le frontend (au plus près du client).

## Critères d'acceptation

- [ ] Desktop + plusieurs sessions Code simultanées, zéro 440
- [ ] Une seule connexion WhatsApp quel que soit le nombre de clients
- [ ] La capture continue tant que le démon tourne, même sans client ouvert
- [ ] Plafond et consentement inchangés (ADR-0002 respecté)
- [ ] ADR dédié (cycle de vie du démon : lancement, supervision, arrêt)

## Notes

Ne construire QUE quand le multi-simultané est un besoin réel constaté (à ce jour :
usage séquentiel, un client à la fois — la règle « npm run stop » suffit).
