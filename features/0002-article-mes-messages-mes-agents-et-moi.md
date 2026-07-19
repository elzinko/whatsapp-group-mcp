---
id: 0002
title: "Article : « Mes messages, mes agents et moi » (le MCP comme leçon de sécurité vécue)"
type: feature
priority: P1
version:
epic:
status: in-progress
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

*(recadrés par le PO le 2026-07-19 : support libre, < 4 min, UN graphique, arc
problème → contexte → solution → implémentation — remplace les 6 chapitres / ≥3 diagrammes)*

- [x] Cadrage PO : < 4 min, un graphique, arc imposé, projet cité
- [x] Premier jet rédigé (~950 mots), chaque affirmation adossée au vécu du repo
- [x] 1 diagramme Mermaid (séquence du grant : plafond + élicitation), syntaxe validée
- [ ] Relecture « intrigue » par Thomas : un lecteur non-MCP comprend et a envie de finir
- [ ] Publication (support au choix de Thomas) → alors `shipped`

## Notes

- Premier jet : `docs/articles/2026-07-19-la-question-que-le-llm-ne-peut-pas-trafiquer.md`.
- Verdict fiche 0001 intégré (élicitation = pilier, mesurée OUI dans Claude Code).
- Teaser final vers la fiche 0007 (élicitation signée / Touch ID) en guise d'ouverture.
