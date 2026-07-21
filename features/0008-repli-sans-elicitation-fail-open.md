---
id: 0008
title: Repli sans élicitation — trancher fail-open ou fail-closed (et le documenter)
type: feature
priority: P1
version:
epic:
status: todo
ready:
pr:
created: 2026-07-21
---

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

- [ ] Le comportement est décidé et **écrit dans l'ADR-0002** (amendement daté)
- [ ] `whatsapp_status` dit sans ambiguïté si les grants de la session ont été confirmés
      par un humain ou auto-accordés
- [ ] Le README et l'article ne laissent plus croire à une garantie inconditionnelle
- [ ] Un test couvre le chemin retenu (le repli existant est déjà couvert par
      `test/elicitation.js`, cas « repli sans capability »)

## Notes

- Découvert le 2026-07-21 en cherchant si l'usage quotidien via Claude Desktop est
  « à peu près sécurisé » — la réponse dépend entièrement de ce repli.
- Type discutable : ce n'est pas franchement un `bug` (le repli est intentionnel,
  cf. le label `via: "client-permissions"`), mais l'absence de documentation, elle, est
  un défaut. Classé `feature` = « décision à prendre et à écrire ».
- Ne pas confondre avec la fiche **0007** (élicitation signée / Touch ID), qui vise à
  *renforcer* le consentement là où il existe. Ici on traite le cas où il **n'existe pas**.
