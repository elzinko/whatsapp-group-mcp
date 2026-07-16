# whatsapp-group-mcp

Serveur **MCP** qui permet à **Claude Desktop** de lire (et éventuellement écrire) dans **un seul groupe WhatsApp**, et rien d'autre.

Il s'appuie sur [Baileys](https://github.com/WhiskeySockets/Baileys), une bibliothèque qui parle le protocole **WhatsApp Web** (appairage par QR code, comme WhatsApp Web dans un navigateur). La session et tes identifiants restent **en local sur ta machine**.

> ⚠️ **À lire avant d'utiliser.** Baileys n'est **pas** une API officielle de WhatsApp/Meta. Automatiser un compte WhatsApp personnel est **contraire aux conditions d'utilisation de WhatsApp** et comporte un risque (faible mais réel) de blocage du compte. Il n'existe pas d'API officielle permettant de brancher un compte perso sur un groupe existant : l'API officielle (WhatsApp Business Cloud API) vise les comptes *business*. Utilise ce projet en connaissance de cause, de préférence avec un numéro dédié.

## Ce que fait ce serveur (et ne fait pas)

- ✅ Lit les messages récents **du seul groupe autorisé** (`WHATSAPP_GROUP_ID`).
- ✅ Peut envoyer un message **dans ce seul groupe**, et uniquement si tu l'actives (`WHATSAPP_ALLOW_SEND=true`).
- ✅ Ne met en mémoire **aucun** message venant d'un autre groupe ou d'un contact.
- ❌ Ne peut pas lire tes discussions privées ni un autre groupe.
- ❌ Ne stocke rien dans le cloud : tout est local.

### Double verrou de sécurité

1. À la réception, seuls les messages dont le JID = `WHATSAPP_GROUP_ID` sont conservés (les autres sont ignorés immédiatement).
2. À l'appel des outils, la cible est **forcée** à `WHATSAPP_GROUP_ID` : aucun outil n'accepte un autre destinataire.

## Prérequis

- Node.js ≥ 20
- Un compte WhatsApp actif sur ton téléphone (pour scanner le QR code)

## Installation

```bash
cd whatsapp-group-mcp
npm install
cp .env.example .env
```

## Premier lancement : appairage + trouver le groupe

Comme WhatsApp Web, il faut d'abord appairer le compte.

```bash
npm start
```

Un **QR code s'affiche dans le terminal**. Sur ton téléphone :
WhatsApp → **Paramètres → Appareils connectés → Connecter un appareil** → scanne le QR.

Une fois « Connecté à WhatsApp. » affiché, la session est enregistrée dans `./auth/` (ignoré par git). Tu n'auras plus à rescanner.

### Cibler le groupe : par nom (simple) ou par JID (exact)

Tu peux désigner le groupe de deux façons dans `.env` :

- **Par nom** (le plus simple si tu ne connais pas le JID) : renseigne le nom exact.
  Le serveur le résout automatiquement en JID à la connexion.

  ```env
  WHATSAPP_GROUP_NAME=Copro reine blanche
  ```

- **Par JID** (exact, prioritaire) : un identifiant du type `120363012345678901@g.us`.

  ```env
  WHATSAPP_GROUP_ID=120363012345678901@g.us
  ```

Pour trouver le JID exact (recommandé une fois pour figer la cible) :

- **Via Claude**, une fois le serveur branché : demande « liste mes groupes WhatsApp » → l'outil `list_groups` renvoie chaque groupe avec son `id`.
- **En ligne de commande** :

  ```bash
  npm start   # laisse tourner, appairé
  # dans un autre terminal :
  npm run list-groups
  ```

Puis **relance** `npm start`. À partir de là, le serveur ne suit plus que ce groupe.

> Astuce : le nom peut changer si un admin renomme le groupe. Une fois le JID connu,
> mieux vaut le figer dans `WHATSAPP_GROUP_ID` (plus stable que le nom).

### Persistance des messages sur disque

Avec `WHATSAPP_PERSIST=true` (défaut), les messages du groupe autorisé sont archivés
dans `./data/<jid>.jsonl` (un message par ligne). Concrètement :

- le fichier disque garde **tout l'historique** capté (archive append-only) ;
- la mémoire ne garde que les `WHATSAPP_MAX_MESSAGES` derniers (défaut 500) ;
- au redémarrage, l'archive est **rechargée** : `get_recent_messages` retrouve l'historique
  même après un reboot, sans dépendre de ce que le téléphone renvoie.

Le dossier `data/` contient le **contenu privé** de la conversation : il est ignoré par git
(voir `.gitignore`) et ne doit pas être partagé.

## Brancher à Claude Desktop

Ajoute ce bloc dans le fichier de config de Claude Desktop
(`claude_desktop_config.json`) :

- macOS : `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows : `%APPDATA%\Claude\claude_desktop_config.json`
- Linux : `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "whatsapp-group": {
      "command": "node",
      "args": ["/CHEMIN/ABSOLU/VERS/whatsapp-group-mcp/src/index.js"],
      "env": {
        "WHATSAPP_GROUP_NAME": "Copro reine blanche",
        "WHATSAPP_ALLOW_SEND": "false",
        "WHATSAPP_PERSIST": "true"
      }
    }
  }
}
```

Remplace le chemin par le chemin absolu réel. Redémarre Claude Desktop. Le serveur apparaît dans les outils MCP.

> Astuce : au tout premier appairage, lance `npm start` **une fois à la main** pour scanner le QR. Ensuite Claude Desktop réutilise la session enregistrée dans `./auth/`.

## Outils exposés

| Outil | Rôle |
|---|---|
| `whatsapp_status` | État de la connexion, groupe configuré, envoi autorisé, messages en mémoire. |
| `list_groups` | Liste des groupes (id + nom) — sert à trouver le `WHATSAPP_GROUP_ID`. Ne renvoie aucun message. |
| `get_recent_messages` | Messages récents du **seul** groupe autorisé (`limit` optionnel, défaut 50). |
| `send_message` | Envoie un texte dans le **seul** groupe autorisé (si `WHATSAPP_ALLOW_SEND=true`). |

## Configuration (`.env`)

| Variable | Défaut | Description |
|---|---|---|
| `WHATSAPP_GROUP_ID` | *(vide)* | JID du groupe autorisé (`…@g.us`). Prioritaire sur le nom. |
| `WHATSAPP_GROUP_NAME` | *(vide)* | Nom exact du groupe, résolu en JID à la connexion. |
| `WHATSAPP_ALLOW_SEND` | `false` | Autorise l'envoi de messages (laisser `false` = lecture seule). |
| `WHATSAPP_PERSIST` | `true` | Archive les messages sur disque (`./data/*.jsonl`). |
| `WHATSAPP_MAX_MESSAGES` | `500` | Taille du tampon **mémoire** (le disque garde tout). |
| `WHATSAPP_AUTH_DIR` | `./auth` | Dossier des identifiants de session. |
| `WHATSAPP_DATA_DIR` | `./data` | Dossier de l'archive des messages. |

## Test rapide (sans WhatsApp)

Vérifie que la couche MCP répond, sans appairage :

```bash
npm run test:mcp
```

## Notes techniques

- `stdout` est réservé au protocole MCP (JSON-RPC). **Tous** les logs et le QR code sont écrits sur `stderr`.
- Les messages récents proviennent (a) de l'historique que le téléphone envoie à la connexion et (b) des nouveaux messages en direct. Le tampon est en mémoire : il repart à zéro à chaque redémarrage.
- Pour révoquer l'accès : WhatsApp → Appareils connectés → déconnecte l'appareil, et supprime le dossier `./auth/`.

## Licence

MIT — fourni tel quel, sans garantie. Usage à tes propres risques (voir l'avertissement en tête).
