---
id: 0007
title: Élicitation signée — consentement par authentification physique (Touch ID / Secure Enclave)
type: feature
priority: P3
version:
epic:
status: idea
ready:
pr:
created: 2026-07-19
---

## Contexte / Problème

L'élicitation (ADR-0002) a une limite assumée : **la base de confiance est le client
MCP** — c'est lui qui affiche le formulaire et rapporte Accept/Decline. Un client
véreux ou compromis pourrait fabriquer une réponse sans rien afficher. Acceptable en
local avec les clients officiels ; insuffisant le jour où le consentement engage plus
(retour de `send`) ou vient de surfaces non fiables (démon en réseau, app mobile).

**Preuve terrain (2026-07-19)** : une v1 naïve du même besoin a été livrée dans le projet
`google-mcp-multi-account` (`gwsa strongauth on` + `scripts/touchid.swift`). Elle fait un
simple **presence check** — `LAContext.evaluatePolicy(.deviceOwnerAuthentication)`, exit 0/1 —
et la garantie s'arrête au code appelant : le processus qui invoque le helper reste juge de
ce qu'il fait du verdict. C'est exactement le cran que cette fiche dépasse.

> **Ce même presence check, porté ici, est la fiche [0013](0013-garde-touchid-presence-grant.md)
> (le « v1 »).** Cette fiche-ci est le « v2 signé ». Ordre pressenti : éprouver d'abord le
> v1 (0013) ; ce v2 ne se justifie que si le presence check se révèle insuffisant — pour un
> serveur read-only dont le pire cas est « tu lis tes propres messages », c'est à débattre.

## Proposition

Un cran au-dessus de l'élicitation : le consentement **hors-bande, côté serveur**,
scellé par une **signature à présence physique** — le client MCP sort de la base de
confiance.

- Clé privée dans la **Secure Enclave** du Mac (elle n'en sort jamais), usage gardé
  par Touch ID / mot de passe de session. Enrôlement une fois, clé publique connue
  du serveur.
- À chaque consentement : le serveur génère un **défi** (nonce + hachage de la
  question datée), un **helper natif Swift** (~100 lignes, LocalAuthentication +
  CryptoKit) demande la signature → **macOS affiche le prompt Touch ID avec la raison
  en clair** (rendu par l'OS, ni LLM ni client) → le serveur vérifie la signature.
- Pas de doigt, pas de grant (fail closed). Nonce = anti-rejeu ; hachage = la
  signature engage cette question précise, pas une autre.
- **Hors protocole MCP, volontairement** : l'élicitation devient informative
  (« regarde ton écran ») ; l'autorité est le cérémonial natif.

Hiérarchie de consentement résultante : permissions client < élicitation <
**élicitation signée** (falsifiable par personne en dessous de root).

### Décisions de conception à tenir (revue du 2026-07-19)

Quatre points structurels — c'est là que ce design se gagne ou se perd :

1. **Signe ce que tu affiches, affiche ce que tu signes.** Le helper reçoit **UN seul
   payload canonique** (action + canal + date + nonce), en dérive **lui-même** le texte du
   prompt Touch ID **et** en signe le hachage. S'il accepte deux entrées séparées (raison
   affichée d'un côté, défi signé de l'autre), un appelant véreux affiche un motif anodin et
   récolte une signature sur autre chose. Le critère « le prompt affiche la question réelle »
   doit être **structurel**, pas déclaratif.
2. **Le garde-fou vit dans la clé, pas dans le code.** Créer la clé d'enclave avec un access
   control `kSecAccessControlBiometryCurrentSet` (ou `.userPresence`) : c'est **l'enclave**
   qui exige Touch ID à chaque signature. Le pattern « `evaluatePolicy` puis signe » est
   contournable — le chemin de signature existe indépendamment de la policy. Bonus de
   `biometryCurrentSet` : la clé s'invalide si le jeu d'empreintes enregistrées change →
   ré-enrôlement obligatoire (c'est une feature, pas un bug).
3. **Où vit la clé publique enrôlée.** La vérification se fait dans le process Node : si
   l'agent peut réécrire le fichier de clé publique (ou le code du serveur), il s'auto-approuve.
   Le modèle de menace l'assume (« client véreux, pas root »), mais il faut **fixer
   l'emplacement** — hors du repo que l'agent édite — et **journaliser les reçus signés**
   (payload + signature + nonce + horodatage) : c'est l'audit trail rejouable, et la seule
   trace qui survit à un doute a posteriori.
4. **Trancher le repli, explicitement.** Clé biométrique pure = **pas** de fallback mot de
   passe (capot fermé, Mac mini sans Touch ID → blocage total) ; `.userPresence` = Apple Watch
   et mot de passe de session acceptés. Les deux se défendent — mais c'est une **décision
   documentée**, jamais un défaut implicite. Et jamais d'accord silencieux en cas d'échec.

## Critères d'acceptation

- [ ] Enrôlement : une commande crée la clé Secure Enclave et enregistre la clé publique
- [ ] La clé est créée avec un **access control biométrique** (`biometryCurrentSet` ou
      `userPresence`) : la signature est impossible sans présence, **au niveau de l'enclave**
- [ ] Un grant (ou un `send` futur) exige une signature fraîche ; rejeu d'une signature
      refusé (nonce) ; question modifiée = signature invalide (hachage)
- [ ] Le prompt Touch ID affiche la question réelle (nom du canal + action + date), **dérivée
      du payload signé lui-même** (une seule entrée, pas deux)
- [ ] Emplacement de la clé publique documenté et **hors du répertoire éditable par l'agent**
- [ ] Chaque consentement produit un **reçu signé journalisé** (payload + signature + nonce)
- [ ] Échec/absence de Touch ID (capot fermé, pas de matériel) → repli explicite
      documenté, jamais un accord silencieux
- [ ] Tests automatisés du protocole défi/signature/vérification (le doigt lui-même
      reste non-automatisable, par construction — même principe que fiche 0001)
- [ ] ADR court (modèle de menace : couvre le client véreux, pas la machine root-compromise)

## Reste à faire (ordre suggéré à la reprise)

1. **Grooming → DoR.** Trancher les 3 décisions ouvertes : (a) `biometryCurrentSet` vs
   `userPresence` (cf. décision 4) ; (b) helper compilé au premier lancement via `swiftc`
   vs binaire commité (déjà noté ci-dessous) ; (c) emplacement de la clé publique + format
   du journal de reçus. Puis `ezk-backlog ready 0007`.
2. **Spike helper signé** (½ j, isolable) : `enroll` (création clé enclave + export clé
   publique) et `sign <payload-json>` (prompt + signature). Vérifier à la main qu'une
   signature obtenue pour la question A ne valide pas la question B.
3. **Protocole Node** : génération du défi (nonce + hachage canonique — figer la
   sérialisation, c'est ce qui est signé), appel du helper, vérification avec la clé
   publique enrôlée, **fail closed** sur tout échec (helper absent, timeout, signature
   invalide, nonce déjà vu).
4. **Tests** avec une **clé logicielle** (même mécanique cryptographique, sans enclave) :
   nominal, rejeu, question altérée, clé inconnue, helper absent. Modèle : `test/elicitation.js`,
   qui teste déjà le protocole sans humain.
5. **Câblage** dans le flux de grant, l'élicitation MCP devenant informative
   (« regarde ton écran »).
6. **ADR** (modèle de menace + hiérarchie de consentement) et mise à jour de l'ADR-0002.
7. **Test en conditions réelles** — ton doigt, à l'enrôlement puis à chaque essai. Non
   délégable : c'est la propriété même qu'on construit.

### Ce qui est automatisable vs ce qui exige ta présence

- **Automatisable** : helper Swift, protocole Node, commande d'enrôlement, toute la suite
  de tests du protocole (clé logicielle), câblage, ADR.
- **Non automatisable, par construction** : le doigt — à l'enrôlement et à chaque test réel.
  Si un agent pouvait tester le Touch ID sans toi, la feature ne vaudrait rien. C'est la
  leçon de la fiche 0001 portée un cran plus loin.

## Notes

- **Déclencheurs** (n'en tirer aucune avant) : retour de `send` · démon exposé au
  réseau (fiches 0005/0006) · client MCP tiers/semi-fiable dans la boucle.
- Option **spike** tirable avant l'heure si l'article (0002) veut son chapitre bonus
  (« la réponse que seul mon doigt peut donner ») : helper Swift autonome + démo,
  sans câblage dans le flux de grant — ½ journée, matériau narratif réel.
- Node ne parle pas à LocalAuthentication : passer par un helper compilé (`swiftc`)
  au premier lancement, ou binaire commité — à trancher au grooming.

### Verdict : pas de « plugin Claude Desktop » (question tranchée le 2026-07-19)

L'écosystème Desktop se résume vite : **Claude Desktop consomme des serveurs MCP**, point.
Ce qu'on appelle « extension Desktop » (paquets `.mcpb`/`.dxt`) n'est qu'un **format
d'emballage** d'un serveur MCP avec installation en un clic — aucune API supplémentaire,
aucun pouvoir d'UI privilégié, et **rien pour l'authentification forte** : le cérémonial
Touch ID viendra de toute façon d'un helper natif local.

Conséquence : construire un plugin Desktop n'apporterait **aucune garantie de plus** et
coûterait un couplage à un seul client. L'architecture de cette fiche est justement la
bonne — le consentement signé vit dans **le serveur + le helper natif**, donc il fonctionne
à l'identique sous Claude Desktop, Claude Code, Gemini CLI…, et il **survit aux fiches
0005/0006** (démon exposé au réseau), précisément le cas où l'élicitation MCP classique
s'effondre. L'emballage en extension Desktop, si un jour le confort d'installation le
justifie, est **orthogonal et cosmétique** : ça peut attendre.

### Brique partagée (piste, à arbitrer)

Deux projets veulent désormais cette brique : **whatsapp-group-mcp** (cette fiche, version
signée) et **google-mcp-multi-account** (`gwsa strongauth`, la v1 presence-check). Le helper
Swift + le protocole défi/vérification mériteraient d'être extraits en **petite brique
partagée** (un binaire + une lib de vérification Node/bash) : enrôlement commun, **un seul
doigt pour tout l'écosystème**, un seul endroit où corriger le modèle de menace. À arbitrer
au grooming — attention à ne pas sur-abstraire avant d'avoir **deux usages réels** qui
tournent.

### Référence externe — l'existant à reprendre

- `google-mcp-multi-account` : `scripts/touchid.swift` (presence check, ~25 lignes,
  `.deviceOwnerAuthentication`), `gwsa strongauth on|off|status`, appelé par
  `require_strong_auth()` avant `unlock` et `grant`. C'est la v1 à faire monter en gamme :
  même dépendance (LocalAuthentication), mêmes contraintes de compilation (`swiftc`, pas
  de Xcode requis), mais **sans** signature ni liaison à la question.
- **Dépendance externe** : ce repo est hors du monorepo — si la brique partagée est retenue,
  poser une ligne datée « dépendance google-mcp-multi-account — accès constaté le AAAA-MM-JJ »
  avant de passer le gate `ready` (exigence DoR).
