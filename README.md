# whatsapp-group-mcp

Serveur **MCP** qui donne à un LLM (Claude Desktop, Cowork…) un accès **en lecture seule**
aux groupes WhatsApp que **tu autorises explicitement**, un par un.

Il s'appuie sur [Baileys](https://github.com/WhiskeySockets/Baileys), une bibliothèque qui parle le protocole **WhatsApp Web** (appairage par QR code, comme WhatsApp Web dans un navigateur). La session et tes identifiants restent **en local sur ta machine**.

> ⚠️ **À lire avant d'utiliser.** Baileys n'est **pas** une API officielle de WhatsApp/Meta. Automatiser un compte WhatsApp personnel est **contraire aux conditions d'utilisation de WhatsApp** et comporte un risque (faible mais réel) de blocage du compte. Il n'existe pas d'API officielle permettant de brancher un compte perso sur un groupe existant : l'API officielle (WhatsApp Business Cloud API) vise les comptes *business*. Utilise ce projet en connaissance de cause, de préférence avec un numéro dédié.

## Ce que fait ce serveur (et ne fait pas)

- ✅ Liste tes groupes, pour que tu choisisses lesquels ouvrir.
- ✅ Lit les messages récents des **seuls groupes autorisés**.
- ✅ Les autorisations **persistent** : tu configures Cowork / Claude Desktop une fois,
  puis tu ouvres et fermes des canaux **en conversation**, sans redémarrer.
- ❌ **N'envoie aucun message.** Il n'existe aucun outil d'envoi, ni aucune variable pour
  l'activer. C'est une propriété du code, pas un réglage.
- ❌ Ne met en mémoire **aucun** message d'un canal non autorisé (ni sur disque).
- ❌ Ne stocke rien dans le cloud : tout est local.

### Ce que ça protège réellement — et ce que ça ne protège pas

À lire une fois, parce que c'est facile de se raconter une histoire ici.

Ton compte WhatsApp peut **déjà** lire tous tes groupes. Les autorisations de ce serveur
n'empêchent donc **aucun attaquant** d'accéder à quoi que ce soit — ce n'est **pas** du
contrôle d'accès. C'est de la **minimisation de données** : elles évitent que tes groupes
privés atterrissent dans un contexte ou un transcript LLM sans que tu l'aies voulu.

Deux barrières font le travail :

1. **À l'ingestion** — un message dont le canal n'est pas autorisé n'entre jamais, ni en
   mémoire, ni sur disque.
2. **À la lecture** — les outils ne lisent que dans les canaux autorisés.

**Limite assumée, à connaître :** le LLM peut appeler `grant_channel` lui-même, donc
élargir son propre périmètre de lecture — y compris s'il est influencé par un message
piégé (*prompt injection*) : le contenu WhatsApp est de la donnée non fiable. C'est
acceptable **uniquement** parce que ce serveur est en lecture seule sur **tes propres**
données : le pire cas est que tu voies tes propres messages. Ce ne serait plus acceptable
si l'écriture existait — d'où son absence, et le contrat posé dans
[docs/adr/0001](docs/adr/0001-modele-d-acces-aux-canaux.md) pour le jour où elle reviendrait.

## Prérequis

- Node.js ≥ 20
- Un compte WhatsApp actif sur ton **téléphone** (pour scanner le QR code)

## Installation

```bash
cd whatsapp-group-mcp
npm install
cp .env.example .env   # optionnel : tout a une valeur par défaut
```

## Premier lancement : appairage

Comme WhatsApp Web, il faut d'abord appairer le compte.

```bash
npm start
```

Un **QR code s'affiche dans le terminal**. Scanne-le **depuis ton téléphone** :

| Plateforme | Chemin |
|---|---|
| **iPhone** | WhatsApp → **Réglages** → **Appareils liés** → **Lier un appareil** |
| **Android** | WhatsApp → **⋮** → **Appareils connectés** → **Connecter un appareil** |

> ⚠️ **Pas depuis WhatsApp Desktop.** L'app macOS/Windows *est elle-même* un appareil lié :
> elle n'a pas cette entrée, et ne peut pas en lier un autre. Seul le téléphone le peut.
> (Le libellé diffère : « Appareils **liés** » sur iOS, « Appareils **connectés** » sur Android.)

Une fois « Connecté à WhatsApp. » affiché, la session est enregistrée dans `./auth/`
(ignoré par git). Tu n'auras plus à rescanner.

Un code `515` suivi d'une reconnexion juste après le scan est **normal** : WhatsApp force
un redémarrage de session après l'appairage, le serveur le gère seul.

> ⚠️ **Un seul process Baileys à la fois.** `npm start` et `npm run list-groups` se
> disputent la session dans `auth/` et se déconnectent mutuellement. Coupe l'un avant de
> lancer l'autre.

## Choisir les groupes — depuis ton LLM

C'est l'usage normal. Une fois le serveur branché, en conversation :

1. « **liste mes groupes WhatsApp** » → `list_groups` renvoie chaque groupe (nom + JID),
   et lesquels sont déjà autorisés.
2. « **autorise le groupe Copro reine blanche** » → `grant_channel` l'ouvre en lecture,
   **de façon persistante**.
3. « **donne-moi les derniers messages de la copro** » → `get_recent_messages`.
4. « **retire l'accès à la copro** » → `revoke_channel`.

Les autorisations sont enregistrées dans `settings.json` (ignoré par git) et survivent
aux redémarrages : **rien à reconfigurer entre deux sessions**.

Au démarrage, elles sont **revérifiées** : un groupe que tu as quitté ou qui n'existe plus
est retiré automatiquement ; un groupe renommé voit son nom mis à jour.

### En ligne de commande (dépannage)

```bash
npm run list-groups   # après avoir coupé `npm start`
```

## Persistance des messages sur disque

Avec `WHATSAPP_PERSIST=true` (défaut), les messages des canaux autorisés sont archivés
dans `./data/<jid>.jsonl` (un message par ligne), **un fichier par canal** :

- le fichier disque garde **tout l'historique** capté (archive append-only) ;
- la mémoire ne garde que les `WHATSAPP_MAX_MESSAGES` derniers, **par canal** ;
- au redémarrage, les archives sont **rechargées** : `get_recent_messages` retrouve
  l'historique même après un reboot.

Le dossier `data/` contient le **contenu privé** de tes conversations : il est ignoré par
git et ne doit pas être partagé. Révoquer un canal ne supprime pas son archive.

## Brancher à Claude Desktop / Cowork

Ajoute ce bloc dans `claude_desktop_config.json` :

- macOS : `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows : `%APPDATA%\Claude\claude_desktop_config.json`
- Linux : `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "whatsapp-group": {
      "command": "node",
      "args": ["/CHEMIN/ABSOLU/VERS/whatsapp-group-mcp/src/index.js"]
    }
  }
}
```

Remplace le chemin par le chemin absolu réel, puis redémarre Claude Desktop. Aucune
variable d'environnement n'est nécessaire : le choix des canaux se fait en conversation.

> Astuce : au tout premier appairage, lance `npm start` **une fois à la main** pour scanner
> le QR. Ensuite le client réutilise la session enregistrée dans `./auth/`.

## Outils exposés

| Outil | Rôle |
|---|---|
| `whatsapp_status` | État de la connexion, canaux autorisés, messages en mémoire. |
| `list_groups` | Tous les groupes du compte (id, nom, déjà autorisé ou non). Aucun message. |
| `grant_channel` | Autorise **la lecture** d'un groupe, de façon persistante. |
| `revoke_channel` | Retire l'autorisation d'un groupe. |
| `get_recent_messages` | Messages récents d'**un** canal autorisé (`channel`, `limit`). |

Il n'y a **pas** d'outil d'envoi. Pour analyser plusieurs canaux, le LLM appelle
`get_recent_messages` une fois par canal.

## Configuration (`.env`)

Tout est optionnel. Voir [`.env.example`](.env.example).

| Variable | Défaut | Description |
|---|---|---|
| `WHATSAPP_GROUP_ID` | *(vide)* | **Amorçage seulement** : converti en autorisation au 1er démarrage si aucune n'existe. Ensuite `settings.json` fait foi. |
| `WHATSAPP_GROUP_NAME` | *(vide)* | Idem, par nom exact. |
| `WHATSAPP_PERSIST` | `true` | Archive les messages sur disque (`./data/*.jsonl`). |
| `WHATSAPP_MAX_MESSAGES` | `500` | Taille du tampon **mémoire**, **par canal**. |
| `WHATSAPP_AUTH_DIR` | `./auth` | Identifiants de session. **Effacé en cas de déconnexion.** |
| `WHATSAPP_DATA_DIR` | `./data` | Archive des messages. |
| `WHATSAPP_SETTINGS_FILE` | `./settings.json` | Canaux autorisés. |

Il n'existe **aucune** variable pour activer l'envoi.

## Test rapide (sans WhatsApp)

```bash
npm test          # store + autorisations + couche MCP
npm run test:mcp  # couche MCP seule, sans appairage
```

## Notes techniques

- `stdout` est réservé au protocole MCP (JSON-RPC). **Tous** les logs et le QR code sont
  écrits sur `stderr`.
- Les messages proviennent (a) de l'historique que le téléphone envoie à la connexion et
  (b) des messages en direct. Seuls les canaux autorisés sont captés.
- `settings.json` est volontairement **hors de `auth/`** : ce dossier est effacé à la
  déconnexion, tes autorisations y seraient perdues.
- Pour révoquer l'accès : WhatsApp → Appareils liés/connectés → déconnecte l'appareil, et
  supprime `./auth/`.

## Décisions d'architecture

- [ADR-0001 — Modèle d'accès aux canaux](docs/adr/0001-modele-d-acces-aux-canaux.md) :
  pourquoi les autorisations plutôt qu'un groupe figé, pourquoi la lecture seule, et le
  contrat à respecter si l'écriture revient un jour.

## Licence

MIT — fourni tel quel, sans garantie. Usage à tes propres risques (voir l'avertissement en tête).
