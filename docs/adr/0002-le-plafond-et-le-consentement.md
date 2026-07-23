# ADR-0002 : Le plafond et le consentement

**Statut :** Accepté
**Date :** 2026-07-18
**Décideurs :** Thomas (propriétaire du projet et du compte WhatsApp)
**Amende :** ADR-0001 (le lieu du contrôle d'accès ; tout le reste de 0001 survit intact)
**Amendé par :** ADR-0003 (le consentement peut désormais être scellé par présence physique — voir note ci-dessous)

## Contexte

L'ADR-0001 a remplacé le groupe unique figé par des grants pilotables en conversation,
avec une faiblesse **assumée** : le gate est le dialogue d'approbation d'outil du client
MCP. Deux faits nouveaux, constatés à l'usage, font tomber ce compromis :

1. **Le gate client est à géométrie variable.** Plusieurs projets de Thomas tournent en
   mode permissions « auto » : dans ces projets, `grant_channel` s'exécute **sans aucune
   question posée à l'humain**. La barrière d'approbation n'existe que là où le client
   veut bien la dresser. Or ADR-0001 conditionnait l'acceptabilité du modèle B à ce gate.
2. **L'ADR-0001 l'avait anticipé sans le construire** : la question ouverte n°1 réservait
   la place d'un plafond (`effectif = grants ∩ plafond`), et la piste élicitation était
   notée « à confirmer ». Le besoin s'est manifesté ; on la referme.

S'ajoute un vécu opérationnel : la session WhatsApp est un singleton disputé (guerres de
sessions 440, appairage rasé par un zombie — voir commits `602b9be`, `b69d1b7`). Toute
extension du modèle d'accès doit composer avec « un seul process par dossier auth ».

### Le brainstorm qui a cadré la décision

Discussion du 2026-07-18 (session Claude). Idées examinées et positionnées :

- **Tokens par client (proposé par Thomas)** : en local, un token stocké sur le même
  disque, dans le même compte utilisateur que les données, n'authentifie rien — celui qui
  peut lire `settings.json` peut lire le token. Idée **juste mais en avance de phase** :
  elle devient légitime quand un consommateur arrive **par le réseau** (app mobile).
- **La vraie menace locale** n'est pas l'intrus mais le **mandataire trop zélé**
  (confused deputy) : un agent LLM qui élargit son propre périmètre de lecture, ou une
  injection dans un message WhatsApp qui l'y pousse. La réponse est le moindre privilège,
  pas l'authentification.
- **Chiffrement au repos** : FileVault couvre le vol de machine ; une crypto applicative
  dont la clé vit à côté des données ne couvre rien de plus. Mesures retenues : permissions
  fichiers, pas de dossier synchronisé cloud, gitignore. Crypto sérieuse = phase réseau.

## Décision

Deux mécanismes complémentaires, du plus dur au plus souple :

### 1. Le PLAFOND — `allowlist.json`, la loi

- Fichier à la racine (gitignored), surchargeable par `WHATSAPP_ALLOWLIST_FILE`.
- **Édité par l'humain, à la main, exclusivement.** Aucun outil MCP ne sait y écrire :
  la capacité n'existe pas dans le code, comme pour l'envoi (ADR-0001, décision 6).
- Entrées : nom exact de groupe, JID, ou `{ jid, name }`. Fichier absent ou corrompu =
  plafond **vide** (fail closed).
- Le plafond borne **tout** : `grant_channel` (refus hors plafond), l'ingestion
  (`grant ∩ plafond` requis pour qu'un message entre), la lecture (`get_recent_messages`
  refuse un canal hors plafond). Un grant dont le canal sort du plafond est **suspendu** —
  pas supprimé : le réintégrer au plafond le réactive tel quel.
- **Migration sans régression** : au premier démarrage sans fichier, le plafond est généré
  depuis les grants existants (seule écriture par le code, avant tout appel d'outil).
  Ensuite, l'humain fait foi.
- Rechargé à chaque décision de grant : une édition manuelle s'applique sans redémarrage.

### 2. Le CONSENTEMENT — élicitation MCP quand le client la supporte

- À chaque `grant_channel` d'un canal au plafond, le serveur envoie une **élicitation**
  (`elicitInput`, SDK ≥ 1.13) : question **rédigée par le serveur**, nom du groupe résolu
  par Baileys, réponse par formulaire du client — **la réponse ne transite jamais par le
  LLM**. C'est la surface d'approbation informée que l'ADR-0001 cherchait.
- Refus, annulation ou échec du formulaire = pas de grant (**fail closed**).
- **Repli** si le client ne supporte pas l'élicitation : le grant reste borné par le
  plafond, et le dialogue d'approbation du client (quand il existe) reste le gate
  conversationnel. La perte est bénigne *précisément parce que le plafond existe* : le
  pire cas redevient « un canal que l'humain avait déjà mis au plafond est activé sans
  formulaire » — de la minimisation en moins, pas une brèche.
- `whatsapp_status` expose le mode de consentement effectif (`grantConsent`).

> **Note d'amendement (ADR-0003, 2026-07-23).** Le repli ci-dessus (« client sans
> élicitation → permissions du client, fail-open ») avait un angle mort assumé : rien ne
> prouvait qu'un humain était présent au grant. L'ADR-0003 ajoute un **troisième cran de
> consentement, imposé côté serveur et donc client-indépendant** : un **presence check
> Touch ID** sur `grant_channel`. Hiérarchie : permissions client (faible) < élicitation <
> **Touch ID (présence physique prouvée)**. Activé par défaut via un drapeau `strong-auth.json`
> **human-only** (aucun outil MCP ne le bascule — même doctrine que le plafond ci-dessous).
> Quand le drapeau est ON, le Touch ID **remplace** l'élicitation et ferme le fail-open de la
> fiche 0008 ; quand il est OFF, tout ce qui précède reste inchangé. Détails et schémas :
> [ADR-0003](0003-consentement-par-presence-touch-id.md).

### Ce qui est explicitement rejeté ou différé

| Option | Sort | Raison |
|---|---|---|
| Tokens/identité par client (local) | **Rejeté** | Aucune isolation réelle dans un même compte OS ; théâtre de sécurité |
| Profils par projet (`.mcp.json` → profil nommé) | **Différé** (phase 1.5 bis) | Bon design, mais exige de choisir déclaration vs détection ; à faire quand le besoin multi-projets est réel |
| Démon unique + frontends MCP minces | **Différé** (phase 2) | Résout le singleton de session pour le multi-simultané ; à construire quand ce besoin existe |
| Tokens + TLS/Tailscale pour l'app mobile | **Différé** (phase 3) | Légitime dès qu'un consommateur arrive par le réseau ; hors périmètre local |
| Chiffrement applicatif au repos | **Différé** | FileVault + permissions + pas de sync cloud suffisent en local |

## Analyse des compromis

**Pourquoi un fichier et pas un outil `set_allowlist` ?** Parce qu'un outil, même gardé
par approbation, remet le périmètre à portée du LLM — et l'expérience du mode « auto »
montre que le gate client peut être absent. La seule garantie robuste est l'inexistence
de la capacité. C'est le même raisonnement que le retrait de `send_message` (ADR-0001).

**Pourquoi l'élicitation en plus du plafond ?** Le plafond est grossier (la liste de ce
qui est *possible*) ; l'élicitation est fine (le consentement pour *cette activation-ci*,
maintenant, avec le nom du groupe sous les yeux). Le plafond évite les erreurs de saisie
et l'auto-élargissement ; l'élicitation évite l'activation silencieuse. Les deux réunis
referment la « faiblesse assumée » de l'ADR-0001.

**Coût accepté** : une étape manuelle de plus (éditer `allowlist.json`) la première fois
qu'un canal entre dans le périmètre. C'est voulu — c'est exactement l'étape que le LLM ne
doit pas pouvoir franchir seul.

## Conséquences

**Plus simple / plus sûr**
- Le pire cas d'un agent zélé passe de « tout le compte » à « le plafond, avec formulaire ».
- Les trois conditions de l'ADR-0001 (lecture seule, données propres, ingestion filtrée)
  gagnent une quatrième : périmètre borné hors de portée du LLM.
- Le formulaire d'élicitation affiche le **nom** du groupe (résolu serveur), pas un JID
  opaque — l'approbation devient informée.

**Plus difficile**
- Ajouter un canal au périmètre = ouvrir un éditeur. Assumé (voir Compromis).
- Un client sans élicitation garde l'ancien niveau de friction/garantie. Mesure faite par
  `whatsapp_status.grantConsent`.

**À revisiter**
- Profils par projet, démon, app mobile : voir tableau ci-dessus (phases 1.5 bis, 2, 3).
- Le jour où `send` revient : le contrat de l'ADR-0001 tient toujours ; l'élicitation
  désormais implémentée en était le prérequis.

## Audit de pré-publication (2026-07-19)

Avant le passage du dépôt en public, un audit de sécurité a reproduit **deux défauts
qui cassaient les invariants ci-dessus**. Corrigés, avec tests de régression :

1. **Le plafond par NOM était usurpable.** Le nom d'un groupe est contrôlé par ses
   administrateurs : un tiers pouvait renommer *son* groupe comme une entrée du plafond
   et devenir autorisable (le formulaire d'élicitation affichait alors le nom usurpé).
   Impact borné en lecture seule — pas d'exfiltration, mais un amplificateur d'injection
   de prompt. **Correctif** : le JID fait foi (`allowlistMatch` distingue `"jid"` de
   `"name"`) ; une couverture par nom seul est refusée dès que **plusieurs** groupes
   connus portent ce nom.
2. **Le retrait d'un canal du plafond était sans effet à chaud.** Le fichier n'était
   rechargé qu'au démarrage et lors d'un grant : l'ingestion et la lecture continuaient
   sur un plafond périmé, contredisant la promesse « sans redémarrage » et la notion de
   grant *suspendu*. **Correctif** : `Allowlist.refresh()` (cache sur mtime+taille,
   un `stat` par décision) appelé dans `_ceilingHas`, donc sur tous les chemins.

Corrigés au passage : ciblage exact dans `scripts/stop.js` (il pouvait tuer le
`src/index.js` d'un autre projet), et permissions `0700/0600` sur `auth/`, `data/`,
`settings.json`, `allowlist.json` (les identifiants de session et les messages étaient
lisibles par tout autre compte de la machine).

Jugés sains et laissés tels quels : absence de capacité d'envoi, absence de tout chemin
d'écriture vers `allowlist.json` depuis un outil MCP, absence de traversée de chemin
(`dataFileFor`), `stdout` réservé au JSON-RPC, consentement fail-closed.

## Actions

1. [x] `src/allowlist.js` — `Allowlist` (load fail-closed, `permits` par JID/nom,
       `bootstrap` de migration unique) + fonctions pures testables.
2. [x] `src/config.js` — `allowlistFile` + `WHATSAPP_ALLOWLIST_FILE`.
3. [x] `src/whatsapp.js` — `_ceilingHas()` ; ingestion, grant et lecture bornés ;
       grants suspendus journalisés ; `confirmGrant` injectable ; `listGroups` expose
       `inAllowlist` ; `status` expose le plafond et les suspensions.
4. [x] `src/index.js` — bootstrap du plafond ; consentement par `elicitInput` avec repli
       et fail closed ; `grantConsent` dans `whatsapp_status`.
5. [x] `.gitignore` — `allowlist.json` + `allowlist-*.json`.
6. [x] `test/allowlist.js` — parsing, correspondance, fail closed, migration unique,
       ingestion bornée, suspension, refus hors plafond, contrat de consentement
       (refus → pas de grant ; accord → grant écrit). `test/grants.js` et
       `test/mcp-smoke.js` adaptés (plafond jetable — un smoke test ne doit pas créer le
       vrai `allowlist.json`).
7. [x] README + `.env.example`.
8. [x] **Mesure en conditions réelles** (Thomas) — **Claude Code : élicitation OUI**
       (2026-07-18, formulaire serveur observé sur `grant_channel` ; suivi en fiche
       0001). Referme l'action ouverte de l'ADR-0001 pour Code ; Desktop/Cowork reste
       à relever. Correctif d'expérience au passage : schéma sans champ — Accept vaut
       consentement, Decline refus (un booléen requis en plus des deux boutons était
       redondant et pénible au clavier).
