---
id: 0001
title: Valider le consentement humain sur Desktop/Cowork (Touch ID, élicitation, session)
type: chore
priority: P0
version:
epic: "20260902223310355"
status: idea
ready:
pr:
created: 2026-07-18
---

## En clair

On sait que la sécurité tient dans **Claude Code** : plafond, consentement, lecture — tout
a été validé en réel le 18 juillet. On ne sait **pas** si ça tient dans **Claude Desktop**
et **Cowork**. Ces deux clients affichent-ils la boîte **Touch ID** ? le formulaire
d'**élicitation** ? le flux **session** marche-t-il ? Cette fiche, c'est **s'asseoir et jouer
le protocole** sur ces deux clients — zéro code, juste une mesure. C'est la **première marche**
de l'épic « accès par session » : tant qu'elle n'est pas franchie, tout l'épic repose sur une
hypothèse non vérifiée.

## Contexte / Problème

Le modèle de sécurité a **grossi** depuis la validation de juillet. À l'époque, le flux
était simple : `grant_channel` → formulaire d'élicitation → lecture. Aujourd'hui, trois
couches se sont ajoutées et **aucune n'a été mesurée sur Desktop/Cowork** :

- **Touch ID** (ADR-0003, fiche 0013) — la présence physique passe **au-dessus** de
  l'élicitation, et elle est **active par défaut**. Le champ `grantConsent` a donc
  **trois** valeurs possibles maintenant, plus deux : Touch ID, élicitation, ou
  « permissions du client ».
- **Sessions** (fiche 20260902223310499) — la lecture n'est plus directe. Il faut
  `session_open` (consentement + périmètre + TTL, jeton porté), puis
  `get_recent_messages` **exige** ce jeton. Deux gestes de consentement distincts :
  capter un canal (`grant_channel`) et ouvrir une session (`session_open`).
- **Profils** (fiche 0004) — le périmètre effectif est `plafond ∩ profil`. `list_groups`
  distingue « hors plafond » de « hors profil ».

La question de fond reste celle des ADR-0001/0002, mais élargie : **Desktop et Cowork
savent-ils demander un consentement que le LLM ne peut pas contourner ?** Si Touch ID
n'y apparaît pas et que l'élicitation n'y est pas supportée, alors sur ces clients
`allowlist.json` redevient le seul garde-fou — ce que la fiche 0008 documente.

Constat de branchement (2026-09-03, à recouper) : `whatsapp-group` est **absent** de la
config Desktop (`npm run doctor`) ; il faut le rebrancher (`npm run install:client`,
Desktop **quitté**, serveurs Code **arrêtés**) avant toute mesure.

## Proposition

Jouer le **protocole de validation manuelle** sur **Desktop**, puis sur **Cowork**, dans
une session cliente dédiée. Le protocole est calqué sur la barre de qualité du projet
frère `google-mcp-multi-account` — **sans la dimension admin** (WhatsApp perso n'a ni
console d'organisation ni IAM). Principe partagé :

> l'outil vérifie · l'humain autorise · le LLM orchestre

Le LLM déroule le protocole, s'arrête à chaque point de contrôle, et **ne consent jamais
lui-même** (Touch ID et élicitation sont des gestes humains — un test qui coche le
formulaire est un robot). L'humain rapporte ce que lui seul voit : la boîte Touch ID, le
formulaire, le message posté depuis le téléphone.

Le protocole (voir « Comment vérifier ») couvre, par client : le mode de consentement
relevé, Touch ID sur `grant_channel` **et** sur `session_open`, le refus hors plafond,
l'isolation par session (`get_recent_messages` refusé sans jeton), le masquage hors
profil, et la lecture E2E.

## Critères d'acceptation

Acquis en juillet — **Claude Code** (à conserver, ne pas rejouer) :

- [x] `grantConsent` relevé pour Claude Code (élicitation OUI, 2026-07-18)
- [x] Refus hors plafond constaté, message guidant vers l'édition manuelle
- [x] Grant d'un canal au plafond via formulaire d'élicitation (Accept/Decline)
- [x] Lecture E2E : messages capturés et relus
- [x] Couverture automatisée du reste (`test/elicitation.js`, `test/sessions.js`, `test/touchid.js`)

À mesurer — **Desktop** et **Cowork** (le reste de la fiche) :

- [ ] `grantConsent` relevé sur Desktop et sur Cowork (une des 3 valeurs : Touch ID / élicitation / permissions client)
- [ ] `grant_channel` sur un canal du plafond : Touch ID observé (ou son absence constatée et expliquée par le relevé)
- [ ] `session_open` : consentement observé, jeton obtenu, `expiresAt` et périmètre corrects
- [ ] `get_recent_messages` **sans** jeton (ou hors périmètre) : refus qui explique comment ouvrir une session
- [ ] Refus hors plafond constaté sur les deux clients (contrôle dur, indépendant du consentement)
- [ ] Lecture E2E réussie via une session (message du téléphone relu)
- [ ] Aucun consentement Touch ID/élicitation déclenché sur un cas **refusé** (hors plafond, hors périmètre)
- [ ] Résultat reporté dans les Notes ci-dessous, et dans la fiche 0008 si un client tombe en « permissions du client »

## Comment vérifier

Le protocole pas-à-pas (prompts à coller, assertions, dépannage) vit dans :

- [docs/tests/validation-manuelle-desktop.md](../docs/tests/validation-manuelle-desktop.md)

Pré-vol obligatoire, dans un terminal **avant** d'ouvrir le client (un seul process sur
`./auth`, sinon erreur 440) :

```bash
npm run stop
npm run doctor   # confirme que whatsapp-group est branché dans le client visé
```

La fiche est **franchie** quand les deux dernières lignes du relevé (Desktop, Cowork) sont
remplies et que tous les critères « à mesurer » sont cochés.

## Notes

Résultats de mesure (à compléter au fil des runs) :

- **2026-07-18, Claude Code : élicitation OUI** ✅ — formulaire serveur observé sur
  `grant_channel` (« MCP server "whatsapp-group" requests your input »). Question des
  ADR-0001/0002 tranchée pour Code.
- **2026-07-18, capture + lecture E2E OK** dans Claude Code (« tout passe », Thomas).
- **Non-automatisable par construction** : prouver qu'un humain a répondu. Un test qui
  répond au formulaire est un robot (`test/elicitation.js` couvre le contrat, pas le geste).
- **Desktop / Cowork : à relever.** Point de vigilance ajouté depuis juillet : la boîte
  **Touch ID** s'affiche-t-elle quand le serveur est lancé par Desktop (réserve ADR-0003) ?

### Rattachement à l'épic « accès par session » (2026-09-03)

Fiche rattachée à l'épic
[20260902223310355](20260902223310355_acces-whatsapp-par-session.md). Le
relevé Desktop/Cowork en est la **première étape** : l'hypothèse la plus risquée, zéro
code. Le profil est la couche **statique** (fiche 0004, livrée) ; la session est la couche
**par conversation** (fiche [20260902223310499](done/20260902223310499_droits-par-session-jeton-porte.md),
livrée). Cette fiche mesure que les deux tiennent **hors de Claude Code**.
