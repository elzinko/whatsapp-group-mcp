---
id: 0004
title: Profils par projet (.mcp.json → profil nommé, effectif = plafond ∩ profil)
type: feature
priority: P2
version:
epic:
status: idea
ready:
pr:
created: 2026-07-18
---

## Contexte / Problème

Le plafond (ADR-0002) est global : tout client qui lance le serveur voit les mêmes
canaux. Thomas veut que chaque projet (répertoire) n'accède qu'aux groupes dont il a
besoin — ex. le projet copro ne lit que la copro, sans que le LLM ait à demander.

## Proposition

Phase 1.5 bis de l'ADR-0002 :
- le `.mcp.json` du projet déclare `WHATSAPP_PROFILE=<nom>` (déclaration explicite,
  jamais de détection du cwd — fragile et falsifiable) ;
- un fichier côté serveur mappe chaque profil vers des canaux (les JID privés ne sont
  jamais commités dans le repo consommateur) ;
- effectif = plafond ∩ profil ; sans profil déclaré : rien (fail closed) ;
- scoper par contenu (le `.mcp.json` suit le checkout) → tous les worktrees d'un projet
  ont les mêmes droits, sans gestion par chemin.

## Critères d'acceptation

- [ ] Un projet avec profil ne voit que l'intersection plafond ∩ profil
- [ ] Un projet sans profil ne voit rien
- [ ] Les JID/noms privés n'apparaissent dans aucun fichier commité côté projet
- [ ] Deux worktrees du même projet → mêmes droits (constaté)
- [ ] ADR-0002 amendé ou ADR-0003 court si le design bouge

## Notes

Attendre un besoin multi-projets réel (aujourd'hui un seul projet consomme le MCP).
Limite connue : deux projets à profils ouverts en même temps = toujours la contrainte
« un seul process par dossier auth » — c'est la fiche 0005 qui la lève.
