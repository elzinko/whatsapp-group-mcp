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

## Critères d'acceptation

- [ ] Enrôlement : une commande crée la clé Secure Enclave et enregistre la clé publique
- [ ] Un grant (ou un `send` futur) exige une signature fraîche ; rejeu d'une signature
      refusé (nonce) ; question modifiée = signature invalide (hachage)
- [ ] Le prompt Touch ID affiche la question réelle (nom du canal + action + date)
- [ ] Échec/absence de Touch ID (capot fermé, pas de matériel) → repli explicite
      documenté, jamais un accord silencieux
- [ ] Tests automatisés du protocole défi/signature/vérification (le doigt lui-même
      reste non-automatisable, par construction — même principe que fiche 0001)
- [ ] ADR court (modèle de menace : couvre le client véreux, pas la machine root-compromise)

## Notes

- **Déclencheurs** (n'en tirer aucune avant) : retour de `send` · démon exposé au
  réseau (fiches 0005/0006) · client MCP tiers/semi-fiable dans la boucle.
- Option **spike** tirable avant l'heure si l'article (0002) veut son chapitre bonus
  (« la réponse que seul mon doigt peut donner ») : helper Swift autonome + démo,
  sans câblage dans le flux de grant — ½ journée, matériau narratif réel.
- Node ne parle pas à LocalAuthentication : passer par un helper compilé (`swiftc`)
  au premier lancement, ou binaire commité — à trancher au grooming.
