---
id: 0009
title: Verrou OS exclusif sur auth/ — garde-fou anti-collision entre process
type: feature
priority: P2
version:
epic:
status: todo
ready:
pr:
created: 2026-07-21
---

## Contexte / Problème

La contrainte dure du projet : **une session WhatsApp = un seul process vivant par
dossier `auth/`**. Deux process sur le même dossier ⇒ erreur 440, rate-limit, et
appairage rasé — il faut re-scanner le QR.

Aujourd'hui la protection est `"prestart": "node scripts/stop.js"` : une approche
« je tue les autres avant de démarrer ». Elle marche pour un démarrage séquentiel, mais
elle **n'empêche pas une course** : deux `npm start` lancés en même temps (Desktop qui
relance son serveur MCP pendant qu'une session Code démarre, par exemple) peuvent tous
deux passer le `stop` puis ouvrir `auth/`.

**Enseignement du projet voisin `google-mcp-multi-account`** (étudié le 2026-07-21) :
leur unicité de process repose entièrement sur `EADDRINUSE` au bind TCP — pas de flock,
pas de PID file. Chez eux c'est inoffensif (le perdant meurt, sans dommage). **Ici ce
serait destructeur** : la disponibilité du port n'est pas un modèle de concurrence
acceptable quand le perdant a déjà eu le temps de toucher `auth/`.

## Proposition

Un **verrou OS exclusif** (flock, ou PID file en `O_EXCL`) pris **avant** d'ouvrir la
session Baileys, pas après :

- Le perdant **n'ouvre rien** : il attend le gagnant, ou sort proprement avec un message
  qui dit quoi faire.
- Le fichier de verrou contient le **PID** du détenteur, pour qu'un verrou orphelin
  (process tué -9, crash) soit récupérable — sinon le verrou transforme une panne
  transitoire en projet inutilisable.
- Cohabite avec `scripts/stop.js` plutôt que de le remplacer : `stop` reste le geste
  humain volontaire, le verrou est le garde-fou automatique.

Bénéfice immédiat, **sans attendre la phase 2** : c'est constructible aujourd'hui et ça
protège l'usage courant (un dossier auth par client, cf. `WHATSAPP_AUTH_DIR`).

## Critères d'acceptation

- [ ] Deux `npm start` simultanés sur le même `auth/` ⇒ zéro dégât, un seul process ouvre
      la session, l'autre sort (ou attend) proprement
- [ ] Le message du perdant dit **quoi faire**, pas juste « erreur »
- [ ] Un verrou orphelin (détenteur tué -9) est récupérable **sans suppression manuelle**
      du fichier par l'utilisateur
- [ ] Le verrou est pris **avant** la première écriture dans `auth/`, pas après
- [ ] Test automatisé du cas concurrent

## Notes

- Recoupe partiellement le 1er critère de l'épic **0005** (« Desktop + plusieurs sessions
  Code simultanées, zéro 440 »), mais s'en distingue : 0005 résout le multi-clients par un
  démon (P3, et sa propre note le gate sur un besoin réel non encore constaté). Le verrou,
  lui, est **autonome, cheap et utile tout de suite**. Si 0005 est un jour construit, le
  verrou devient le garde-fou du démon lui-même.
- Piège trouvé chez le voisin, à ne pas reproduire : si le fichier de secret/verrou est
  supprimé pendant qu'un process tourne, leur code régénère un secret, spawn un second
  process qui meurt, et l'ancien refuse tout — blocage permanent sans chemin de
  récupération. D'où le critère « verrou orphelin récupérable ».
