// Enveloppe autour de Baileys (protocole WhatsApp Web).
// IMPORTANT : tout ce qui est log/QR est écrit sur STDERR.
// STDOUT est réservé au protocole MCP (JSON-RPC) ; y écrire le corromprait.
//
// LECTURE SEULE : ce client ne sait pas envoyer de message. Il n'y a pas de méthode
// d'envoi, pas de drapeau pour l'activer. Voir docs/adr/0001-modele-d-acces-aux-canaux.md
// pour le contrat à respecter le jour où l'écriture reviendra.

import fs from "node:fs";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

import { dataFileFor, isGroupJid } from "./config.js";
import { MessageStore } from "./store.js";

// Log applicatif -> stderr
export function log(...args) {
  console.error("[whatsapp-mcp]", ...args);
}

// Extrait le texte lisible d'un message WhatsApp (conversation, légende, etc.)
function extractText(message) {
  if (!message) return null;
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    null
  );
}

function toRecord(waMessage) {
  const key = waMessage.key || {};
  const ts = waMessage.messageTimestamp;
  const timestamp =
    typeof ts === "number"
      ? ts
      : ts?.low ?? (ts ? Number(ts) : Math.floor(Date.now() / 1000));
  return {
    id: key.id,
    groupId: key.remoteJid,
    sender: key.participant || waMessage.participant || key.remoteJid,
    fromMe: !!key.fromMe,
    pushName: waMessage.pushName || null,
    text: extractText(waMessage.message),
    timestamp,
  };
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

// Décide quoi faire quand la connexion se ferme. Fonction PURE (aucun effet de bord),
// pour être testable sans WhatsApp. Voir test/reconnect-plan.js.
//   - "wipe"   : identifiants invalides (401) -> effacer auth, ré-appairage requis.
//   - "giveup" : session remplacée (440) -> une autre connexion a pris la main sur le
//                même dossier auth ; se reconnecter relancerait une guerre + un rate-limit.
//   - "retry"  : coupure ordinaire (515 restart, réseau…) -> reconnexion avec backoff
//                exponentiel plafonné (2s, 4s, 8s… max 60s), `attempt` = n° de tentative.
export function planReconnect(statusCode, attempt) {
  if (statusCode === DisconnectReason.loggedOut) return { action: "wipe" };
  if (statusCode === DisconnectReason.connectionReplaced) return { action: "giveup" };
  const delayMs = Math.min(60000, 2000 * 2 ** Math.max(0, attempt - 1));
  return { action: "retry", delayMs };
}

export class WhatsAppClient {
  constructor(config, settings) {
    this.config = config;
    this.settings = settings; // Settings : la source de vérité des canaux autorisés
    this.sock = null;
    this.state = "starting"; // starting | qr | connecting | open | closed
    this.lastQR = null;
    this.startedAt = Date.now();
    this.stores = new Map(); // jid -> MessageStore (un tampon + une archive par canal)
    this.knownGroups = new Map(); // jid -> nom, snapshot du dernier fetch
    this.reconnectAttempts = 0; // pour le backoff exponentiel des reconnexions
    this.giveUp = false; // vrai si une autre session a pris la main (440) : on cesse de lutter
  }

  isReady() {
    return this.state === "open" && !!this.sock;
  }

  // Tampon d'un canal, créé à la demande et rattaché à son archive JSONL.
  _storeFor(jid) {
    let store = this.stores.get(jid);
    if (store) return store;
    store = new MessageStore(this.config.maxMessages);
    if (this.config.persist) {
      const file = dataFileFor(jid);
      const loaded = store.attachFile(file);
      log(`Canal ${jid} : ${loaded} message(s) rechargé(s) depuis ${file}`);
    }
    this.stores.set(jid, store);
    return store;
  }

  // 1re barrière : rien de ce qui n'est pas explicitement autorisé n'entre,
  // ni en mémoire ni sur disque.
  _ingest(waMessage) {
    const jid = waMessage?.key?.remoteJid;
    if (!jid || !this.settings.has(jid)) return;
    const rec = toRecord(waMessage);
    if (rec.id) this._storeFor(jid).add(rec);
  }

  async start() {
    const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = undefined; // Baileys utilisera une version par défaut
    }

    // Les archives des canaux déjà autorisés sont rechargées avant même la connexion :
    // get_recent_messages répond dès le démarrage, sans attendre WhatsApp.
    for (const g of this.settings.list()) this._storeFor(g.jid);

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }, pino.destination(2)), // Baileys -> stderr, muet
      printQRInTerminal: false, // on gère le QR nous-mêmes (vers stderr)
      browser: Browsers.appropriate(this.config.deviceName),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        this.state = "qr";
        this.lastQR = qr;
        log("Scanne ce QR code depuis ton TÉLÉPHONE :");
        log("  iPhone  : WhatsApp > Réglages > Appareils liés > Lier un appareil");
        log("  Android : WhatsApp > ⋮ > Appareils connectés > Connecter un appareil");
        // qrcode-terminal écrit par défaut sur stdout -> on redirige vers stderr
        qrcode.generate(qr, { small: true }, (art) => process.stderr.write(art + "\n"));
      }
      if (connection === "connecting") {
        this.state = "connecting";
        log("Connexion à WhatsApp…");
      }
      if (connection === "open") {
        this.state = "open";
        this.lastQR = null;
        this.reconnectAttempts = 0; // connexion réussie : on repart de zéro
        log("Connecté à WhatsApp.");
        try {
          await this._refreshGroups();
          this._revalidateGrants();
          this._bootstrapFromEnv();
        } catch (e) {
          log("Initialisation des canaux impossible :", e?.message);
        }
        for (const g of this.settings.list()) this._storeFor(g.jid);
        if (this.settings.grants.size === 0) {
          log(
            "Aucun canal autorisé. Demande à ton LLM : « liste mes groupes WhatsApp » puis « autorise <nom> »."
          );
        } else {
          log(
            `Canaux autorisés en lecture : ${this.settings
              .list()
              .map((g) => `« ${g.subject || g.jid} »`)
              .join(", ")}`
          );
        }
      }
      if (connection === "close") {
        this.state = "closed";
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const plan = planReconnect(statusCode, this.reconnectAttempts + 1);

        if (plan.action === "wipe") {
          // 401 : déconnecté côté téléphone -> on efface les identifiants (ré-appairage requis).
          log("Connexion fermée (code=401). Déconnecté.");
          try {
            fs.rmSync(this.config.authDir, { recursive: true, force: true });
            log("Session effacée. Relance le serveur pour ré-appairer.");
            log("Les canaux autorisés sont conservés dans settings.json.");
          } catch {}
          return;
        }

        if (plan.action === "giveup") {
          // 440 : une AUTRE connexion utilise le même dossier auth et a pris la main.
          // Se reconnecter relancerait une guerre de sessions (et un rate-limit).
          this.giveUp = true;
          log(
            "Connexion fermée (code=440) : une autre session utilise le même dossier auth " +
              `(${this.config.authDir}). Arrêt des reconnexions pour éviter le conflit et le rate-limit. ` +
              "N'exécute qu'UN seul client à la fois sur ce dossier, ou donne à chacun son propre WHATSAPP_AUTH_DIR."
          );
          return;
        }

        // "retry" : coupure ordinaire -> reconnexion avec backoff exponentiel plafonné.
        this.reconnectAttempts += 1;
        log(
          `Connexion fermée (code=${statusCode}). Reconnexion dans ${Math.round(plan.delayMs / 1000)}s ` +
            `(tentative ${this.reconnectAttempts})…`
        );
        setTimeout(() => {
          if (!this.giveUp) this.start().catch((e) => log("Echec reconnexion:", e?.message));
        }, plan.delayMs);
      }
    });

    // Historique récent envoyé par le téléphone à la connexion
    sock.ev.on("messaging-history.set", ({ messages }) => {
      for (const m of messages || []) this._ingest(m);
    });

    // Messages en direct
    sock.ev.on("messages.upsert", ({ messages }) => {
      for (const m of messages || []) this._ingest(m);
    });

    return this;
  }

  // Rafraîchit le snapshot des groupes du compte. Renvoie les métadonnées brutes.
  async _refreshGroups() {
    const all = await this.sock.groupFetchAllParticipating();
    this.knownGroups = new Map(Object.values(all).map((g) => [g.id, g.subject]));
    return all;
  }

  // Revérification au démarrage : un grant dont le groupe a disparu (ou dont le compte
  // n'est plus membre) est purgé. Un groupe renommé voit son nom rafraîchi.
  _revalidateGrants() {
    for (const g of this.settings.list()) {
      if (!this.knownGroups.has(g.jid)) {
        this.settings.revoke(g.jid);
        this.stores.delete(g.jid);
        log(`Grant purgé (groupe inaccessible ou compte non membre) : « ${g.subject || "?"} » (${g.jid})`);
        continue;
      }
      const current = this.knownGroups.get(g.jid);
      if (current && current !== g.subject) {
        this.settings.grant(g.jid, current);
        log(`Groupe renommé : « ${g.subject} » -> « ${current} »`);
      }
    }
  }

  // Amorçage : convertit un WHATSAPP_GROUP_ID/NAME hérité en grant, une seule fois.
  // Dès qu'un grant existe, settings.json fait foi et l'env n'est plus consulté.
  _bootstrapFromEnv() {
    if (this.settings.grants.size > 0) return;
    const wanted = this.config.groupId || this.config.groupName;
    if (!wanted) return;

    let jid = null;
    if (isGroupJid(this.config.groupId)) {
      jid = this.knownGroups.has(this.config.groupId) ? this.config.groupId : null;
    } else {
      const target = normalize(this.config.groupName);
      for (const [id, subject] of this.knownGroups) {
        if (normalize(subject) === target) {
          jid = id;
          break;
        }
      }
    }

    if (!jid) {
      log(`Amorçage .env : groupe « ${wanted} » introuvable. Utilise 'list_groups' puis 'grant_channel'.`);
      return;
    }
    const subject = this.knownGroups.get(jid);
    this.settings.grant(jid, subject);
    this._storeFor(jid);
    log(`Amorçage depuis .env : « ${subject} » autorisé en lecture (${jid}).`);
  }

  // Résout un JID ou un nom exact de groupe vers un JID.
  // Les canaux déjà autorisés sont résolvables même hors connexion.
  _resolveToJid(channel) {
    const raw = String(channel || "").trim();
    if (!raw) throw new Error("Aucun canal fourni.");
    if (isGroupJid(raw)) return raw;

    const target = normalize(raw);
    for (const g of this.settings.list()) {
      if (normalize(g.subject) === target) return g.jid;
    }
    const matches = [...this.knownGroups.entries()].filter(([, s]) => normalize(s) === target);
    if (matches.length === 1) return matches[0][0];
    if (matches.length > 1) {
      throw new Error(`Plusieurs groupes s'appellent « ${raw} » : utilise le JID exact (…@g.us).`);
    }
    throw new Error(`Groupe « ${raw} » introuvable. Utilise 'list_groups' pour voir les noms et JID.`);
  }

  // Le « menu » : tous les groupes du compte, avec leur état d'autorisation.
  // Ne renvoie aucun contenu de message.
  async listGroups() {
    if (!this.isReady()) throw new Error("WhatsApp non connecté (scanne d'abord le QR code).");
    const all = await this._refreshGroups();
    return Object.values(all)
      .map((g) => ({
        id: g.id,
        subject: g.subject,
        participants: Array.isArray(g.participants) ? g.participants.length : undefined,
        granted: this.settings.has(g.id),
      }))
      .sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));
  }

  // Autorise la LECTURE d'un canal. Le nom mémorisé est toujours celui résolu par
  // Baileys, jamais celui fourni par l'appelant (ADR-0001).
  async grantChannel(channel) {
    if (!this.isReady()) throw new Error("WhatsApp non connecté (scanne d'abord le QR code).");
    await this._refreshGroups();
    const jid = this._resolveToJid(channel);
    if (!this.knownGroups.has(jid)) {
      throw new Error(`Groupe inconnu, ou le compte n'en est pas membre : ${jid}`);
    }
    const subject = this.knownGroups.get(jid);
    this.settings.grant(jid, subject);
    this._storeFor(jid);
    log(`Grant LECTURE accordé : « ${subject} » (${jid})`);
    return { jid, subject, scope: "read", granted: true };
  }

  // Retire l'autorisation. L'archive disque déjà écrite n'est pas supprimée.
  revokeChannel(channel) {
    const jid = this._resolveToJid(channel);
    const subject = this.settings.grants.get(jid)?.subject || null;
    if (!this.settings.revoke(jid)) throw new Error(`Ce canal n'est pas autorisé : ${jid}`);
    this.stores.delete(jid);
    log(`Grant révoqué : « ${subject || jid} » (${jid})`);
    return { jid, subject, revoked: true };
  }

  // Messages récents d'UN canal autorisé. Si `channel` est omis et qu'un seul canal
  // est autorisé, c'est lui. Sinon il faut choisir explicitement.
  recentFor(channel, limit = 50) {
    const granted = this.settings.list();
    let jid;
    if (channel) {
      jid = this._resolveToJid(channel);
      if (!this.settings.has(jid)) {
        throw new Error(`Canal non autorisé : ${jid}. Utilise 'grant_channel' d'abord.`);
      }
    } else if (granted.length === 1) {
      jid = granted[0].jid;
    } else if (granted.length === 0) {
      throw new Error(
        "Aucun canal autorisé. Utilise 'list_groups' pour voir tes groupes, puis 'grant_channel'."
      );
    } else {
      const noms = granted.map((g) => `« ${g.subject || g.jid} »`).join(", ");
      throw new Error(`Plusieurs canaux autorisés : précise 'channel' parmi ${noms}.`);
    }
    const store = this._storeFor(jid);
    return {
      jid,
      subject: this.settings.grants.get(jid)?.subject || null,
      messages: store.recent(limit),
      buffered: store.size(),
    };
  }

  status() {
    const granted = this.settings.list();
    return {
      state: this.state,
      connected: this.isReady(),
      // Ce serveur ne sait pas envoyer : il n'existe aucune méthode d'envoi (ADR-0001).
      readOnly: true,
      grantedChannels: granted.map((g) => ({
        jid: g.jid,
        subject: g.subject,
        scope: g.scope,
        messagesBuffered: this.stores.get(g.jid)?.size() ?? 0,
      })),
      persistence: this.config.persist
        ? { enabled: true, dir: this.config.dataDir }
        : { enabled: false },
      settingsFile: this.config.settingsFile,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      hint:
        this.state === "qr"
          ? "Un QR code est affiché dans les logs : scanne-le depuis ton téléphone (iPhone : Réglages > Appareils liés ; Android : ⋮ > Appareils connectés)."
          : granted.length === 0
            ? "Aucun canal autorisé : appelle 'list_groups' puis 'grant_channel'."
            : undefined,
    };
  }
}
