---
id: 0006
title: Accès réseau pour l'app mobile — tokens à capabilities, TLS/Tailscale (phase 3)
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

L'idée d'origine de Thomas : une app mobile qui interroge le MCP. Un consommateur qui
arrive **par le réseau** sort du compte macOS — la frontière locale ne protège plus
rien. C'est le moment (et le seul) où l'idée de tokens devient légitime : en local,
un token stocké à côté des données n'authentifie rien (brainstorm ADR-0002).

## Proposition

Le démon (0005, prérequis) expose une API réseau ; jamais Baileys directement.
- Tokens à **capabilities** : scope ⊆ plafond, expirables, révocables, un par app.
- Transport : Tailscale d'abord (déjà dans l'outillage de Thomas, repousse l'exposition
  publique), TLS si un jour hors tailnet.
- Lecture seule, comme tout le reste (ADR-0001).

## Critères d'acceptation

- [ ] L'app mobile lit UNIQUEMENT les canaux du scope de son token
- [ ] Révocation d'un token effective sans redémarrage
- [ ] Aucune surface réseau sans authentification ; Baileys jamais exposé
- [ ] ADR dédié (modèle de menace réseau, format des tokens, rotation)

## Notes

Dépend de 0005. Chapitre 6 de l'article (0002) : « Le jour où mon téléphone voudra
lire mon téléphone ».
