// Chargement de la configuration depuis l'environnement + un éventuel fichier .env.
// Volontairement sans dépendance (pas de dotenv) pour garder le projet léger.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function loadDotEnv() {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Retire d'éventuels guillemets englobants
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Ne pas écraser une variable déjà définie dans l'environnement réel
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

function bool(v, fallback) {
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

const authDir = process.env.WHATSAPP_AUTH_DIR
  ? path.resolve(projectRoot, process.env.WHATSAPP_AUTH_DIR)
  : path.join(projectRoot, "auth");

const dataDir = process.env.WHATSAPP_DATA_DIR
  ? path.resolve(projectRoot, process.env.WHATSAPP_DATA_DIR)
  : path.join(projectRoot, "data");

// Réglages persistants (canaux autorisés). Volontairement hors de authDir, qui est
// effacé au logout WhatsApp, et hors de dataDir, qui est l'archive des messages.
const settingsFile = process.env.WHATSAPP_SETTINGS_FILE
  ? path.resolve(projectRoot, process.env.WHATSAPP_SETTINGS_FILE)
  : path.join(projectRoot, "settings.json");

export const config = {
  projectRoot,
  // Amorçage uniquement : au tout premier démarrage, si aucun grant n'existe encore,
  // ce groupe est converti en grant de lecture. Ensuite, settings.json fait foi et
  // ces variables ne servent plus à rien (voir ADR-0001).
  groupId: (process.env.WHATSAPP_GROUP_ID || "").trim(),
  groupName: (process.env.WHATSAPP_GROUP_NAME || "").trim(),
  // Taille du tampon mémoire, PAR canal autorisé (le disque garde tout).
  maxMessages: Number.parseInt(process.env.WHATSAPP_MAX_MESSAGES || "500", 10) || 500,
  // Persistance des messages sur disque (archive JSONL, survit aux redémarrages).
  persist: bool(process.env.WHATSAPP_PERSIST, true),
  // Nom affiché dans WhatsApp > Appareils liés/connectés. Figé AU MOMENT de
  // l'appairage : le changer n'a d'effet qu'après un ré-appairage (QR).
  deviceName: (process.env.WHATSAPP_DEVICE_NAME || "").trim() || "whatsapp-group-mcp",
  authDir,
  dataDir,
  settingsFile,
};

// Un JID de groupe WhatsApp se termine toujours par "@g.us".
export function isGroupJid(jid) {
  return typeof jid === "string" && jid.endsWith("@g.us");
}

// Nom de fichier sûr pour un JID (ex: "12036...@g.us" -> "12036..._g.us.jsonl")
export function dataFileFor(groupId) {
  const safe = String(groupId).replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(dataDir, `${safe}.jsonl`);
}
