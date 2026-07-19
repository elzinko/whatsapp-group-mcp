---
id: 0003
title: Hygiène locale — permissions fichiers, FileVault, pas de dossier synchronisé
type: chore
priority: P2
version:
epic:
status: todo
ready:
pr:
created: 2026-07-18
---

## Contexte / Problème

`auth/` (identifiants de session WhatsApp) et `data/` (messages privés) sont en clair
sur le disque. Le brainstorm de l'ADR-0002 a tranché : pas de crypto applicative en
local (la clé vivrait à côté des données), mais trois mesures gratuites restent à faire.

## Proposition

1. `chmod 700 auth data` (+ vérifier que le serveur crée ces dossiers en 700).
2. Vérifier que FileVault est actif (Réglages macOS → Confidentialité et sécurité).
3. Vérifier que le projet ne vit pas dans un dossier synchronisé cloud (iCloud/Dropbox)
   et documenter cet interdit dans le README (section sécurité).

## Critères d'acceptation

- [ ] `auth/` et `data/` en 700, y compris à la (re)création par le code
- [ ] FileVault vérifié actif (constat noté ici)
- [ ] README : une ligne « jamais dans un dossier synchronisé » dans la section sécurité

## Notes

Option différée (notée ADR-0002) : clé dans le trousseau macOS pour chiffrer l'archive
au repos — n'ouvrir que si un besoin réel apparaît (sauvegardes partagées, multi-comptes).
