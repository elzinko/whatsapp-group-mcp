---
id: 0012
title: ADR — le serveur MCP reste read-only et ne configure jamais le client
type: chore
priority: P2
version:
epic:
status: todo
ready:
pr:
created: 2026-07-22
---

## Contexte / Problème

Idée soulevée le 2026-07-22 : et si le serveur MCP écrivait lui-même sa config dans
`claude_desktop_config.json` (via élicitation) pour réduire la friction de branchement ?

Séduisant, mais ça **retourne le principe de sécurité central du projet**. La menace
déclarée est le **mandataire zélé** (confused deputy). Tout tient parce que le serveur est
en lecture seule et que l'humain édite la config et le plafond à la main. Donner au serveur
un outil qui écrit la config d'un client, c'est lui donner de quoi **ajouter des serveurs**
ou **repointer `command`** vers un binaire malveillant — gardé par un simple formulaire.
S'ajoutent un **paradoxe d'amorçage** (sous Desktop, le serveur n'existe que s'il est déjà
configuré) et le fait que **Desktop réécrit ce fichier en direct**.

Décision prise au checkpoint du 2026-07-22 : **non**. La config client est écrite par un
**installer humain** ([0010](0010-installer-doctor-cli.md)) ; le serveur MCP ne l'écrit
jamais. Reste à **tracer** cette décision dans un ADR, comme l'ADR-0002 l'a fait pour le
plafond.

## Proposition

Écrire `docs/adr/0003-le-serveur-ne-configure-pas-le-client.md` (format court, comme les
ADR existants) :

- **Décision** : aucun outil MCP n'écrit la configuration d'un client (ni Desktop, ni Code,
  ni autre). Le serveur peut au plus **diagnostiquer** et **rendre le bloc à coller**
  (lecture seule, cf. l'outil d'aide 0011 / le `doctor` de 0010).
- **Pourquoi** : confused deputy ; frontière read-only ; paradoxe d'amorçage ; l'app réécrit
  le fichier. Le geste humain au terminal est la racine de confiance.
- **Conséquences** : l'ergonomie de branchement passe par une CLI humaine, pas par le LLM ;
  cohérent avec « le plafond n'est éditable qu'à la main » (ADR-0002).
- **Le jour où on voudrait revenir dessus** : ce que ça exigerait (au minimum une auth forte
  liant le consentement à l'écriture exacte — cf. Touch ID signé, [0007](0007-elicitation-signee-touch-id.md)).

## Critères d'acceptation

- [ ] ADR-0003 écrit, accepté, lié depuis le README (section Décisions d'architecture)
- [ ] La frontière est citée par la fiche installer (0010) comme sa contrainte de conception
- [ ] Aucun code ajouté ici : c'est une décision documentée (le code éventuel est en 0010)

## Notes

Fiche `chore`/docs volontairement séparée de l'installer (0010) : la **décision** (ADR) et
son **implémentation** (CLI) ont des cycles de vie distincts — l'ADR peut être écrit et
accepté avant que l'installer soit construit.
