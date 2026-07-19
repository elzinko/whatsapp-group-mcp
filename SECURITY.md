# Politique de sécurité

## Signaler une vulnérabilité

Merci de **ne pas ouvrir d'issue publique** pour un problème de sécurité.

Utilise l'onglet **Security → Report a vulnerability** du dépôt (GitHub Private
Vulnerability Reporting). Une réponse sous 7 jours est visée — c'est un projet
personnel, pas un produit avec astreinte.

## Périmètre

Ce serveur MCP tourne **en local**, sur la machine de son utilisateur, en **stdio** :
il n'ouvre aucun port et n'expose aucune surface réseau. Le modèle de menace est donc
particulier — l'adversaire pertinent n'est pas un intrus distant, mais un **mandataire
trop zélé** : un agent LLM qui élargirait son propre périmètre de lecture, ou une
injection de prompt cachée dans un message WhatsApp.

**Dans le périmètre** — les rapports suivants nous intéressent :

- un contournement du **plafond** (`allowlist.json`) : lire, ingérer ou autoriser un
  canal absent de ce fichier ;
- un chemin d'écriture vers `allowlist.json` accessible depuis un outil MCP (le fichier
  doit être modifiable **uniquement à la main**) ;
- l'apparition d'une capacité d'**envoi** de message (le serveur est en lecture seule
  par construction : aucun outil d'envoi ne doit exister) ;
- une fuite de contenu de messages ou d'identifiants de session (`auth/`) : sur
  `stdout` (réservé au JSON-RPC), dans les logs, ou dans une réponse d'outil ;
- une écriture hors des dossiers prévus (traversée de chemin via un JID) ;
- l'obtention d'un grant sans le consentement de l'humain quand le client supporte
  l'élicitation.

**Hors périmètre** :

- une machine déjà compromise au niveau administrateur (à ce stade, les fichiers sont
  lisibles directement, aucune barrière applicative n'a de sens) ;
- le fait que le compte WhatsApp appairé puisse lire ses propres groupes : ce projet
  fait de la **minimisation de données**, pas du contrôle d'accès au compte ;
- les risques inhérents à Baileys et au protocole WhatsApp Web (voir l'avertissement du
  README : automatiser un compte personnel est contraire aux CGU de WhatsApp).

## Décisions de conception liées

Le raisonnement de sécurité est documenté et versionné :

- [ADR-0001](docs/adr/0001-modele-d-acces-aux-canaux.md) — lecture seule, canaux
  autorisés explicitement, ingestion filtrée.
- [ADR-0002](docs/adr/0002-le-plafond-et-le-consentement.md) — le plafond hors de portée
  du LLM, et le consentement rédigé par le serveur (élicitation MCP).

## Ce que l'utilisateur doit protéger lui-même

- `auth/` contient les **identifiants de session WhatsApp** ; `data/` contient le
  **contenu des messages**. Les deux sont ignorés par git — ne les commite jamais, ne
  place pas le projet dans un dossier synchronisé (iCloud, Dropbox…), et garde le
  chiffrement du disque activé (FileVault sur macOS).
- Pour révoquer l'accès : WhatsApp → Appareils liés/connectés → déconnecte l'appareil,
  puis supprime `auth/`.
