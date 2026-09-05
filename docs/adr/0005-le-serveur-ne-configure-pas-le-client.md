# ADR-0005 : Le serveur MCP ne configure jamais le client

**Statut :** Accepté
**Date :** 2026-07-22 (décision prise au checkpoint) — tracée le 2026-09-05
**Décideurs :** Thomas (propriétaire du projet et du compte WhatsApp)
**Lié :** ADR-0001 (frontière read-only), ADR-0002 (le plafond éditable à la main uniquement)
**Feature :** [0012](../../features/0012-adr-serveur-ne-configure-pas-le-client.md) — la décision ; l'implémentation de l'installer humain vit en [0010](../../features/done/0010-installer-doctor-cli.md)

## Contexte

Idée soulevée le 2026-07-22 : et si le serveur MCP écrivait lui-même sa configuration dans
`claude_desktop_config.json` (via un formulaire d'élicitation) pour réduire la friction de
branchement ? C'est séduisant, mais ça **retourne le principe de sécurité central du
projet**.

La menace déclarée est le **mandataire zélé** (*confused deputy*). Tout le modèle tient
parce que le serveur est en **lecture seule** et que **l'humain** édite la configuration du
client et le plafond, à la main. Donner au serveur un outil qui écrit la config d'un client,
c'est lui donner de quoi **ajouter des serveurs MCP** ou **repointer un `command`** vers un
binaire arbitraire — le tout gardé par un simple formulaire qu'un message piégé peut pousser
le LLM à présenter.

Trois raisons de plus, concrètes :

1. **Paradoxe d'amorçage.** Sous Claude Desktop, le serveur n'existe (n'est appelable) que
   s'il est **déjà** configuré. Il ne peut donc pas être ce qui écrit sa propre config.
2. **Desktop réécrit ce fichier en direct.** Une écriture par le serveur entrerait en course
   avec l'application.
3. **La racine de confiance est le geste humain au terminal.** C'est ce qui distingue une
   config légitime d'une config injectée.

## Décision

**Aucun outil MCP n'écrit la configuration d'un client** — ni Claude Desktop, ni Claude
Code, ni aucun autre. Le serveur peut, au plus :

- **diagnostiquer** l'état du branchement (lecture seule) ;
- **rendre le bloc de configuration à coller** (texte, pas d'écriture).

La configuration du client est écrite par un **installer humain** en CLI
([0010](../../features/done/0010-installer-doctor-cli.md) : `npm run doctor` lit,
`npm run install:client` écrit — lancé par l'humain, refuse si Desktop tourne, backup
d'abord, fusion idempotente). L'outil d'aide MCP ([0011](../../features/done/0011-outil-aide-mcp.md))
reste, lui aussi, strictement en lecture.

## Conséquences

- L'ergonomie de branchement passe par une **CLI humaine**, pas par le LLM. C'est cohérent
  avec « le plafond n'est éditable qu'à la main » (ADR-0002) : la même racine de confiance
  vaut pour la config du client.
- La frontière read-only du serveur (ADR-0001) est préservée de bout en bout : le serveur ne
  gagne aucun pouvoir d'écriture, même « juste pour la config ».
- La fiche installer [0010](../../features/done/0010-installer-doctor-cli.md) cite cette
  frontière comme sa **contrainte de conception** : elle absorbe l'envie « que ça se
  configure tout seul » sans donner au serveur un pouvoir d'écriture.

## Le jour où on voudrait revenir dessus

Il faudrait, au minimum, une **authentification forte liant le consentement à l'écriture
exacte** — l'humain approuve *ce contenu précis*, pas « une écriture de config » en général.
C'est la direction de l'élicitation signée / Touch ID signé
([0007](../../features/0007-elicitation-signee-touch-id.md)). Tant que ce lien n'existe pas,
un formulaire seul ne suffit pas : il est falsifiable par le contexte qui l'entoure.
