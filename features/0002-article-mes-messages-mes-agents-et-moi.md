---
id: 0002
title: "Article : « Mes messages, mes agents et moi » (le MCP comme leçon de sécurité vécue)"
type: feature
priority: P1
version:
epic:
status: idea
ready:
pr:
created: 2026-07-18
---

## Contexte / Problème

Le développement de ce MCP a produit une intrigue réelle et complète — chaque incident
vécu motive la décision d'architecture suivante. Thomas veut un article « qui donne envie
de lire telle une belle intrigue », avec de beaux diagrammes. La matière première est
dans le git log et les deux ADR ; il manque la rédaction.

## Proposition

Récit en 6 chapitres, chacun ancré dans un artefact vérifiable du repo :

1. *« Un seul groupe, en dur »* — l'innocence du premier design (import initial).
2. *« Do you want to proceed? »* — grants dynamiques, default-deny (ADR-0001).
3. *« code=440 »* — la guerre de sessions : un singleton disputé (commit `602b9be`).
4. *« ENOENT: creds.json »* — le zombie qui rase un appairage (commit `b69d1b7`).
5. *« Qui a le droit de lire mes messages ? »* — le renversement : l'attaquant est le
   mandataire (confused deputy) ; le plafond + l'élicitation (ADR-0002, `a39f6cf`).
6. *« Le jour où mon téléphone voudra lire mon téléphone »* — l'app mobile, la frontière
   réseau, le moment où les tokens cessent d'être du théâtre (phase 3, fiche 0006).

Diagrammes versionnés via `ezk-diagram` (architecture 3 étages, séquence d'élicitation,
la guerre de sessions). Dépend du résultat de la fiche 0001 (élicitation : pilier ou
note de bas de page).

## Critères d'acceptation

- [ ] Plan validé par Thomas (angle, ton, support de publication)
- [ ] 6 chapitres rédigés, chaque affirmation technique adossée à un commit/ADR réel
- [ ] ≥ 3 diagrammes versionnés dans `diagrams/` (prose + Mermaid + SVG)
- [ ] Relecture « intrigue » : un lecteur non-MCP comprend et a envie de finir

## Notes

À groomer après la fiche 0001 (le chapitre 5 a besoin du verdict `grantConsent`).
