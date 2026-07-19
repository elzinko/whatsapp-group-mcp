---
id: 0001
title: Valider l'ADR-0002 en conditions réelles (plafond, élicitation, lecture E2E)
type: chore
priority: P0
version:
epic:
status: todo
ready:
pr:
created: 2026-07-18
---

## Contexte / Problème

Le plafond (`allowlist.json`) et le consentement par élicitation sont livrés (commit
`a39f6cf`, ADR-0002) et testés hors connexion, mais l'action 8 de l'ADR reste ouverte :
**la mesure en conditions réelles**. On ne sait toujours pas si les clients de Thomas
(Claude Code, Desktop/Cowork) supportent l'élicitation — c'est aussi la question restée
ouverte de l'ADR-0001, et elle décide de la place de l'élicitation dans l'article (0002)
et de l'avenir d'un éventuel `send`.

## Proposition

Dans une session Claude Code fraîche (`npm run stop` d'abord) :

1. « quel est le statut whatsapp ? » → relever `grantConsent`.
2. « autorise le groupe Basket loisir » → vérifier le refus « hors du plafond ».
3. « retire l'accès à Test auto WhatsApp » puis « autorise Test auto WhatsApp » →
   observer (ou non) le formulaire d'élicitation.
4. Poster un message dans le groupe depuis le téléphone → « montre les derniers
   messages » → le message apparaît.

Répéter le point 1 dans Claude Desktop/Cowork.

## Critères d'acceptation

- [ ] `grantConsent` relevé pour Claude Code ET Claude Desktop/Cowork (noté ici en Notes)
- [ ] Refus hors plafond constaté avec le message guidant vers l'édition manuelle
- [ ] Grant d'un canal au plafond constaté (formulaire d'élicitation OU repli permissions)
- [ ] Lecture E2E : un message posté depuis le téléphone ressort via `get_recent_messages`
- [ ] Action 8 de l'ADR-0002 cochée avec le résultat de la mesure

## Notes

Résultats de mesure :
- **2026-07-18, Claude Code : élicitation OUI** ✅ — formulaire serveur observé sur
  `grant_channel` (« MCP server "whatsapp-group" requests your input »). La question
  restée ouverte des ADR-0001/0002 est tranchée pour Code.
- **2026-07-18, capture E2E OK** — status : « Test auto WhatsApp — 2 messages en
  mémoire » (l'ingestion fonctionne) ; relecture via `get_recent_messages` à confirmer.
- **Défaut UX corrigé dans la foulée** : le schéma exigeait un booléen `autoriser` en
  plus d'Accept/Decline — redondant et pénible à cocher en TUI. Schéma vidé :
  Accept = consentir, Decline = refuser. Nécessite un redémarrage du serveur
  (`npm run stop` + nouvelle session) pour être visible.
- Restant : `grantConsent` sur Desktop/Cowork, refus hors plafond, relecture E2E.
