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

**Preuve terrain** : le projet voisin `google-mcp-multi-account` a livré les deux crans —
v1 (2026-07-19, `scripts/touchid.swift` + presence check) et **v2 signé** (2026-07-28,
commit `f642d8b` sur `feat/v2-local-deploy`) — avant cette fiche. La v1 fait un simple
**presence check** (`LAContext.evaluatePolicy`, exit 0/1) : le processus appelant reste
juge du verdict. La v2 implémente **cette fiche** côté `gwsa` (payload canonique, signature
Secure Enclave, reçus) — voir § Référence d'implémentation. Ici, le v1 est déjà porté
(fiche [0013](done/0013-garde-touchid-presence-grant.md)) ; le v2 signé reste à adapter.

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
2. **Spike helper signé** — **fait ailleurs** (google-mcp `f642d8b`, voir § Référence
   d'implémentation). Reste : porter `elicitation-sign.swift` + valider enroll/sign en local
   whatsapp, puis vérifier à la main qu'une signature pour la question A ne valide pas B.
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

Deux projets ont désormais cette brique : **whatsapp-group-mcp** (cette fiche, v2 signé —
pas encore implémenté ici) et **google-mcp-multi-account** (v2 livré côté `gwsa`, v1
presence-check). Le helper Swift + le protocole défi/vérification mériteraient d'être
extraits en **petite brique partagée** (un binaire + une lib de vérification Node/Python) :
enrôlement commun, **un seul doigt pour tout l'écosystème**, un seul endroit où corriger le
modèle de menace. Décision actuelle côté google-mcp : **copie locale**, extraction différée
(ADR-0005) — à reprendre au grooming whatsapp.

## Référence d'implémentation

**État constaté le 2026-07-28** : le v2 signé de cette fiche est **livré** dans
`google-mcp-multi-account` sans attendre l'implémentation whatsapp — le transport WhatsApp
reste bloqué côté ce repo, mais la brique cryptographique est prête à porter/adapter.

| Élément | Chemin (repo `google-mcp-multi-account`) |
|---|---|
| Point d'entrée | `feat/v2-local-deploy` @ `f642d8b` |
| Helper Swift (enroll + sign) | `scripts/elicitation-sign.swift` |
| Protocole (payload, nonce, reçus) | `gateway/elicitation.py` |
| CLI gate / enroll | `scripts/elicitation-cli.py` |
| Intégration humaine | `bin/gwsa` → `gwsa elicitation enroll\|status`, `require_signed_elicitation()` |
| ADR (modèle de menace, fail closed) | `docs/adr/ADR-0005-elicitation-signee-v2.md` |
| Fiche miroir | `features/0001-elicitation-signee-strongauth-v2.md` |
| v1 presence check (déjà porté ici en 0013) | `scripts/touchid.swift`, `gwsa strongauth` |

### Réutilisable tel quel (ou quasi)

- **Un seul payload canonique** : le helper dérive le prompt Touch ID *et* signe le JSON
  (SHA-256 + ECDSA P-256 Secure Enclave, `biometryCurrentSet`).
- **Anti-rejeu** : nonce + TTL ; journal `receipts.jsonl` + `nonces.json`.
- **Mode mock CI** : `GWSA_ELICITATION_MOCK=1` + clé HMAC (même mécanique de tests sans
  doigt — modèle pour `test/elicitation.js` ici).
- **Compilation** : `swiftc` au runtime, pas de Xcode requis (même contrainte que 0013).

### À adapter pour whatsapp-group-mcp

| Aspect | google-mcp (`gwsa`) | whatsapp (cible) |
|---|---|---|
| Actions signées | `unlock`, `grant`, `add_account`, `session_*`, `project_sign` | `grant_channel` (nom du canal), éventuellement `send` futur |
| Couche de vérification | Python (`gateway/elicitation.py`) | Node (`src/…`) — reprendre la logique, pas le langage |
| Emplacement clé publique | `~/.config/gws-accounts/.elicitation/` | Hors repo, hors répertoire éditable par l'agent (cf. décision 3) |
| Déclencheur | CLI `gwsa` avant unlock/grant | Serveur MCP stdio sur `grant_channel` (faisabilité GUI : prouvée en 0013) |
| Élicitation MCP | Informative quand strongauth actif | Idem : le doigt signé *est* le consentement |

L'implémentation google-mcp **ne remplace pas** le grooming de cette fiche (décisions 1–4,
emplacement de la clé, repli biométrie) mais **évite de réinventer** le spike helper et le
protocole — point de départ concret pour l'étape 2 du § Reste à faire.

**Dépendance externe** (exigence DoR) : repo hors monorepo — avant le gate `ready`, poser
une ligne datée « dépendance google-mcp-multi-account — accès constaté le 2026-07-28 »
(référence ci-dessus).
