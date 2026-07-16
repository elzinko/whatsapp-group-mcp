// Enveloppe autour de Baileys (protocole WhatsApp Web).
// IMPORTANT : tout ce qui est log/QR est écrit sur STDERR.
// STDOUT est réservé au protocole MCP (JSON-RPC) ; y écrire le corromprait.

import fs from "node:fs";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

import { dataFileFor } from "./config.js";

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

export class WhatsAppClient {
  constructor(config, store) {
    this.config = config;
    this.store = store;
    this.sock = null;
    this.state = "starting"; // starting | qr | connecting | open | closed
    this.lastQR = null;
    this.startedAt = Date.now();
    // JID effectif du groupe autorisé (peut être résolu par nom à la connexion)
    this.groupId = config.groupId || null;
    this.groupName = config.groupName || null;
    this._persistAttached = false;
  }

  isReady() {
    return this.state === "open" && !!this.sock;
  }

  // Attache la persistance disque dès que le JID du groupe est connu.
  _attachPersistence() {
    if (this._persistAttached || !this.config.persist || !this.groupId) return;
    const file = dataFileFor(this.groupId);
    const loaded = this.store.attachFile(file);
    this._persistAttached = true;
    log(`Persistance activée: ${loaded} message(s) chargé(s) depuis ${file}`);
  }

  async start() {
    const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = undefined; // Baileys utilisera une version par défaut
    }

    // Si le JID est déjà connu (via .env), on charge l'archive tout de suite,
    // avant même la connexion, pour disposer de l'historique persistant.
    this._attachPersistence();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }, pino.destination(2)), // Baileys -> stderr, muet
      printQRInTerminal: false, // on gère le QR nous-mêmes (vers stderr)
      browser: Browsers.appropriate("Claude MCP"),
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
        log("Scanne ce QR code avec WhatsApp (Appareils connectés) :");
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
        log("Connecté à WhatsApp.");
        try {
          await this._resolveGroupByName();
        } catch (e) {
          log("Résolution du groupe par nom impossible:", e?.message);
        }
        this._attachPersistence();
        if (!this.groupId) {
          log(
            "Aucun groupe défini. Utilise 'list_groups' (ou scripts/list-groups.js) pour trouver le JID, puis renseigne WHATSAPP_GROUP_ID (ou WHATSAPP_GROUP_NAME) dans .env."
          );
        }
      }
      if (connection === "close") {
        this.state = "closed";
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        log(`Connexion fermée (code=${statusCode}).`, loggedOut ? "Déconnecté." : "Reconnexion…");
        if (!loggedOut) {
          setTimeout(() => this.start().catch((e) => log("Echec reconnexion:", e?.message)), 2000);
        } else {
          try {
            fs.rmSync(this.config.authDir, { recursive: true, force: true });
            log("Session effacée. Relance le serveur pour ré-appairer.");
          } catch {}
        }
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

  // Résout le JID à partir du nom de groupe (WHATSAPP_GROUP_NAME) si le JID n'est pas déjà connu.
  async _resolveGroupByName() {
    if (this.groupId || !this.groupName) return;
    const all = await this.sock.groupFetchAllParticipating();
    const target = normalize(this.groupName);
    const match = Object.values(all).find((g) => normalize(g.subject) === target);
    if (match) {
      this.groupId = match.id;
      log(`Groupe "${this.groupName}" résolu -> ${match.id}`);
    } else {
      const noms = Object.values(all).map((g) => g.subject).join(", ");
      log(`Groupe "${this.groupName}" introuvable. Groupes disponibles: ${noms || "(aucun)"}`);
    }
  }

  // Ne stocke QUE les messages du groupe autorisé.
  _ingest(waMessage) {
    if (!this.groupId) return;
    const jid = waMessage?.key?.remoteJid;
    if (jid !== this.groupId) return;
    const rec = toRecord(waMessage);
    if (rec.id) this.store.add(rec);
  }

  // Liste des groupes dont le compte est membre (id + nom). Pas de contenu de messages.
  async listGroups() {
    if (!this.isReady()) throw new Error("WhatsApp non connecté (scanne d'abord le QR code).");
    const all = await this.sock.groupFetchAllParticipating();
    return Object.values(all).map((g) => ({
      id: g.id,
      subject: g.subject,
      participants: Array.isArray(g.participants) ? g.participants.length : undefined,
      isAllowed: g.id === this.groupId,
    }));
  }

  // Envoi de texte, UNIQUEMENT vers le groupe autorisé et seulement si allowSend=true.
  async sendMessage(text) {
    if (!this.isReady()) throw new Error("WhatsApp non connecté (scanne d'abord le QR code).");
    if (!this.config.allowSend) throw new Error("Envoi désactivé (WHATSAPP_ALLOW_SEND=false).");
    if (!this.groupId) throw new Error("Aucun groupe autorisé défini.");
    const res = await this.sock.sendMessage(this.groupId, { text: String(text) });
    return { id: res?.key?.id, groupId: this.groupId };
  }

  status() {
    return {
      state: this.state,
      connected: this.isReady(),
      groupConfigured: !!this.groupId,
      groupId: this.groupId || null,
      groupName: this.groupName || null,
      allowSend: this.config.allowSend,
      persistence: this._persistAttached
        ? { enabled: true, file: dataFileFor(this.groupId) }
        : { enabled: false },
      messagesBuffered: this.store.size(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      hint:
        this.state === "qr"
          ? "Un QR code est affiché dans les logs : scanne-le depuis WhatsApp > Appareils connectés."
          : !this.groupId && this.groupName
            ? `En attente de connexion pour résoudre le groupe "${this.groupName}".`
            : undefined,
    };
  }
}
