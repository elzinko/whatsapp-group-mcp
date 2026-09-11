# Plan — whatsapp-group-mcp

> Séquence **décidée** (curée, pas générée). **Décidé le 2026-09-11** avec Thomas.
> Le gate `ready` prime pour *tirer maintenant* ; ce plan prime pour *décider la suite*.
> Index du backlog : [BACKLOG.md](BACKLOG.md).

**Fil directeur** : « ça doit marcher pour un **chat sur Claude Desktop** » — épic
[20260902223310355](20260902223310355_acces-whatsapp-par-session.md).

## NOW — les 2 prochaines cartes

1. [0001](0001-valider-adr-0002-conditions-reelles.md) — mesurer le consentement sur
   Desktop/Cowork, **Touch ID d'abord** (façon google-mcp-multi-account) · **audit** (zéro
   code, une mesure). Seule carte `ready`, répond direct à « un chat Desktop marche-t-il ? ».
2. [0005](0005-demon-frontends-mcp.md) — démon unique + frontends minces (**P2**) · **groom**
   d'abord (décomposer l'épic en fiches tirables : démon, frontends, admin de monitoring),
   puis **build**. Ossature du multi-conversation (plusieurs chats Desktop / Cowork + Code).

## Garées — maintenues, pas tirées

- [0002](0002-article-mes-messages-mes-agents-et-moi.md) — article : **non publié**, gardé
  dans `docs/articles/`, tenu à jour.
- [0007](0007-elicitation-signee-touch-id.md) — élicitation signée v2 : **porter la version
  de google quand un déclencheur apparaît** (`send` / démon réseau / client non fiable). Aucun
  aujourd'hui.
- [20260902223310640](20260902223310640_emballage-plugin-cowork-marketplace.md) — emballage
  plugin : différé ; préférer une commande `wire` (extension de `install:client`). Après 0005.
- [0006](0006-app-mobile-tokens.md) — app mobile / réseau : **garée très loin** (diverge du
  local-first de google).

## Épics — jamais tirés, on tire leurs enfants

- [20260902223310355](20260902223310355_acces-whatsapp-par-session.md) — accès par session
  (**in-progress**) : le fil. Enfants : 0001, 0004 ✓, 0005 (prérequis frère), plugin.
- [0005](0005-demon-frontends-mcp.md), [0006](0006-app-mobile-tokens.md) — épics frères.
