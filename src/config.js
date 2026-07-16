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

export const config = {
  projectRoot,
  // JID du seul groupe autorisé (ex: "1203630xxxxxxxxxx@g.us"). Vide = non défini.
  groupId: (process.env.WHATSAPP_GROUP_ID || "").trim(),
  // Alternative : nom exact du groupe (ex: "Copro reine blanche"). Résolu en JID à la connexion.
  // Utile quand on ne connaît pas encore le JID. groupId a la priorité s'il est renseigné.
  groupName: (process.env.WHATSAPP_GROUP_NAME || "").trim(),
  allowSend: bool(process.env.WHATSAPP_ALLOW_SEND, false),
  maxMessages: Number.parseInt(process.env.WHATSAPP_MAX_MESSAGES || "500", 10) || 500,
  // Persistance des messages sur disque (archive JSONL, survit aux redémarrages).
  persist: bool(process.env.WHATSAPP_PERSIST, true),
  authDir,
  dataDir,
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
