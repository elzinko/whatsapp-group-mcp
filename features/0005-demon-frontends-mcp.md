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

### Précédent étudié : `google-mcp-multi-account` (2026-07-21)

Le projet voisin a livré exactement cette architecture (« Phase 2A local broker », commit
`12114ac`). Deux enseignements qui **recadrent** l'idée initiale d'un « broker de tokens » :

**1. Leur token n'authentifie personne — et ils le savent.** C'est un secret global unique
(`.broker-token`), identique pour tous les clients, sans scope. Leur propre threat-model
écrit que toute identité déclarée localement est « spoofable, pas une identité forte », et
que le vrai périmètre est par profil, jamais par client. Leur Phase 2A n'ajoute donc
**aucune frontière de sécurité** : elle prépare la plomberie.

**2. Notre motivation est différente de la leur.** Chez eux le broker est un confort. Ici
c'est une **nécessité fonctionnelle** : N clients MCP × 1 process chacun sur `auth/` = panne
garantie. La menace traitée est la **disponibilité** (deux process détruisent la session),
pas la confidentialité. Donc : ne pas reprendre le mot « token » comme s'il authentifiait
quelqu'un. Un secret partagé ne vaut ici que comme **garde-fou anti-process-parasite** —
c'est de la sûreté, pas de la sécurité, et ça doit être écrit comme tel.

**Transférable tel quel** : le découpage client RPC mince / daemon détenteur de la capacité /
contrat stable au milieu · `ensure_broker_running()` (ping → spawn détaché → polling borné →
log en append) · NDJSON une ligne par requête sur loopback, deux verbes · serveur MCP sans
dépendance externe + shim à chemin absolu qui pose le PATH lui-même · policy évaluée en
process séparé avec « non classifiable = refus » et « config corrompue = refus ».

**À ne PAS reprendre** : le bind TCP comme modèle de singleton (cf. fiche **0009**) · le
threading libre — une socket WhatsApp unique exige une file + worker unique, là où leur
`gws` est sans état · le token global présenté comme une frontière.

**À écrire de zéro** : la machine à états d'une session WhatsApp longue (connecting /
paired / logged-out / needs-QR). Leur broker est sans état, il n'y a rien à copier là.

**Si un scope par client devient un besoin** (« ce Desktop lit #famille, ce Code non ») :
il faut un token **par client**, dont le périmètre est vérifié côté broker — strictement
plus que ce que fait le voisin, à concevoir et non à copier.
