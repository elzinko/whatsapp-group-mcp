---
id: 0008
title: Documenter le repli sans élicitation (fail-open refermé par défaut par l'ADR-0003)
type: chore
priority: P2
version:
epic:
status: ready
ready: 2026-09-06
pr:
created: 2026-07-21
---

> **Mise à jour 2026-09-06 (revue backlog).** La question **de sécurité est tranchée**
> depuis l'[ADR-0003](../docs/adr/0003-consentement-par-presence-touch-id.md) : la garde
> Touch ID est **ON par défaut**, imposée côté serveur, donc **indépendante du client**.
> Sur un client sans élicitation, le grant ne retombe donc plus en *fail-open* silencieux
> tant que le drapeau `strong-auth.json` est armé (défaut) — il exige une présence physique.
> **Le trou de sécurité de cette fiche est fermé par défaut.** Ce qui reste est de la
> **documentation** : le README et l'article ne décrivent pas encore explicitement ce repli,
> et `whatsapp_status` doit dire sans ambiguïté comment un grant a été confirmé. D'où la
> bascule **`feature P1` → `chore P2`**.

## Contexte / Problème

`src/consent.js:11-13` accorde le grant **sans aucune question humaine** quand le client
MCP ne déclare pas la capability `elicitation` :

```js
if (!isElicitationSupported()) {
  return { accepted: true, via: "client-permissions" };
}
```

Le repli est donc **fail-open**, en contraste net avec le `catch` situé six lignes plus
bas, qui est explicitement fail-closed (« si le formulaire n'a pas pu être présenté, on
n'accorde rien »). Cette asymétrie n'est écrite nulle part : ni dans l'ADR-0002, ni dans
le README, ni dans l'article.

**Ce qui est en jeu.** Sur un client sans élicitation, la garantie centrale de l'ADR-0002
— *la question est rédigée par le serveur, la réponse ne transite jamais par le LLM* —
**disparaît en silence**. Il ne reste que le plafond `allowlist.json`. Or c'est
précisément la thèse de l'article 0002 (« La question que le LLM ne peut pas trafiquer »)
qui devient conditionnelle au client, sans que rien ne le signale à l'utilisateur.

L'intention derrière `via: "client-permissions"` est défendable : Claude Desktop a son
propre prompt d'approbation d'outil. Mais un prompt d'outil (« autoriser `grant_channel` ? »)
est **cadré par le LLM**, alors que l'élicitation est rédigée par le serveur — ce sont
deux objets de nature différente, et c'est exactement la distinction que l'ADR-0002 pose.

## Proposition

Trancher explicitement entre trois options, puis l'écrire :

- **(a)** garder le fail-open et le **documenter** franchement (ADR-0002 + README +
  article) : « sur un client sans élicitation, le plafond est le seul contrôle ».
- **(b)** passer **fail-closed par défaut**, avec opt-in explicite dans les settings pour
  qui accepte le repli.
- **(c)** garder le fail-open mais le rendre **visible** : journalisé, et exposé dans
  `whatsapp_status` (« grants de cette session : auto-accordés, client sans élicitation »).

Dépend du résultat de la fiche **0001** : si Claude Desktop supporte l'élicitation, la
question perd beaucoup de son urgence ; s'il ne la supporte pas, elle devient le point
de sécurité n°1 de l'usage quotidien.

## Critères d'acceptation

- [x] Le comportement est décidé et **écrit dans un ADR** — l'ADR-0003 (garde Touch ID)
      tranche : fail-closed par présence physique, ON par défaut ; note d'amendement datée
      dans l'ADR-0002
- [x] `whatsapp_status` dit sans ambiguïté si les grants ont été confirmés par un humain
      ou auto-accordés *(fait : `status()` expose par grant `consentVia` + `confirmedByHuman`
      — élicitation/Touch ID → `true`, client-permissions → `false`, grant antérieur au
      suivi → `null` ; couvert par `test/consent-provenance.js`)*
- [x] Le README et l'article ne laissent plus croire à une garantie inconditionnelle
      *(fait : README « Le repli sans élicitation — quand le plafond reste seul » ; puce
      « La garantie dépend du client » ajoutée à l'article)*
- [x] Un test couvre le chemin retenu (`test/consent-strongauth.js` : refus si la présence
      n'est pas prouvée ; `test/elicitation.js` : repli sans capability)

## Comment vérifier

- `npm test` — suite complète verte, dont `test/grants.js` (persistance de `via` + rechargement
  d'un `settings.json` legacy sans `via`) et `test/consent-provenance.js` (classification dans
  `status()`).
- Appeler `whatsapp_status` : chaque entrée de `grantedChannels` porte `consentVia` (valeur
  brute) et `confirmedByHuman` — `true` pour un grant confirmé par élicitation ou Touch ID,
  `false` pour un grant auto-accordé (`client-permissions`), `null` pour un grant antérieur au
  suivi.
- Lire, côté doc : README § « Le repli sans élicitation — quand le plafond reste seul », et la
  puce « La garantie dépend du client — et le repli est nommé » de l'article.

## Notes

- Découvert le 2026-07-21 en cherchant si l'usage quotidien via Claude Desktop est
  « à peu près sécurisé » — la réponse dépend entièrement de ce repli.
- Type discutable : ce n'est pas franchement un `bug` (le repli est intentionnel,
  cf. le label `via: "client-permissions"`), mais l'absence de documentation, elle, est
  un défaut. Classé `feature` = « décision à prendre et à écrire ».
- Ne pas confondre avec la fiche **0007** (élicitation signée / Touch ID), qui vise à
  *renforcer* le consentement là où il existe. Ici on traite le cas où il **n'existe pas**.
