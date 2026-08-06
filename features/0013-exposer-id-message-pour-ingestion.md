---
id: 0013
title: Exposer l'id de message (et le JID canal) dans get_recent_messages pour une ingestion idempotente
type: feature
priority: P2
version:
epic:
status: todo
ready:
pr:
created: 2026-08-06
---

## Contexte / Problème

Le projet `elzinko/elzinko` (service de reformulation « dans mon style ») ingère
mes messages WhatsApp comme corpus, en réutilisant CE serveur MCP tel quel, en
sous-processus stdio (adaptateur `McpClientSource`, fiche elzinko 0003 —
conforme à l'esprit du projet : on hérite du plafond `allowlist.json` et des
canaux autorisés, on ne réécrit rien, on n'appelle jamais `grant_channel`).

L'ingestion doit être **idempotente** (rejouable sans doublon) : il lui faut un
identifiant **stable** par message. Or `get_recent_messages` ne renvoie pas
l'id WhatsApp : `toRecord()` le capture (`key.id`, `src/whatsapp.js`) mais le
mapping de la réponse (`src/index.js`, case `get_recent_messages`) le laisse
tomber — seuls `from`, `sender`, `fromMe`, `text`, `at` sortent. Côté elzinko,
le contournement actuel est un hachage (jid, at, sender, text) : stable, mais
fragile (message édité = nouvel id) et moins propre que l'id natif.

## Proposition

Dans la réponse de `get_recent_messages`, ajouter à chaque message :

- `id` : l'id WhatsApp du message (`key.id`), déjà présent dans le record ;
- et au niveau canal, `channel.jid` est déjà renvoyé — rien à faire.

Une ligne dans le mapping, zéro nouvelle capacité, zéro donnée supplémentaire
sensible (l'id est un identifiant technique, pas du contenu). Lecture seule
inchangée, plafond inchangé.

Optionnel (à discuter, hors périmètre minimal) :
- `only_mine: boolean` — ne renvoyer que mes messages (`fromMe`), pour que le
  filtrage « écrit par moi » se fasse à la source (minimisation : les messages
  des autres ne traversent pas la frontière du sous-processus) ;
- `since: string (ISO)` — borne temporelle basse, premier pas vers une lecture
  incrémentale par curseur (elzinko fiche 0008).

## Critères d'acceptation

- [ ] `get_recent_messages` renvoie `id` pour chaque message.
- [ ] Champs existants inchangés (compatibilité clients actuels).
- [ ] README (« Outils exposés ») mis à jour.

## Notes

Consommateur demandeur : `elzinko/elzinko` (`apps/api/src/infrastructure/sources/mcp-client-source.ts`,
recette `WhatsappRecipe`) — basculera du hachage vers `id` dès que disponible.
