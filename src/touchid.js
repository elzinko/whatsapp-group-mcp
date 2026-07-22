// Wrapper Node autour du helper Swift d'authentification forte locale (Touch ID /
// Watch / mot de passe de session, via LAContext.evaluatePolicy). Voir
// scripts/touchid.swift pour le helper lui-même.
//
// FAIL CLOSED : ok:true UNIQUEMENT sur exit code 0 (authentifié). Toute autre sortie
// (refus, indisponibilité, code inattendu, échec de spawn, timeout) retourne
// ok:false — jamais d'accord silencieux.
//
// `swift` est pris en chemin ABSOLU par défaut : un serveur MCP spawné par un client
// GUI (Claude Desktop, etc.) hérite d'un PATH minimal, on ne peut pas compter dessus.

import path from "node:path";
import { execFile } from "node:child_process";
import { config } from "./config.js";

export const TOUCHID = {
  AUTHENTICATED: "authenticated",
  REFUSED: "refused",
  UNAVAILABLE: "unavailable",
  ERROR: "error",
};

const DEFAULT_SWIFT = "/usr/bin/swift";
const DEFAULT_SCRIPT = path.join(config.projectRoot, "scripts", "touchid.swift");
const DEFAULT_TIMEOUT_MS = 60_000;

const STATUS_BY_EXIT_CODE = {
  0: TOUCHID.AUTHENTICATED,
  1: TOUCHID.REFUSED,
  2: TOUCHID.UNAVAILABLE,
};

export async function checkPresence({
  reason,
  swift = DEFAULT_SWIFT,
  script = DEFAULT_SCRIPT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  return new Promise((resolve) => {
    execFile(swift, [script, reason], { timeout: timeoutMs }, (err) => {
      if (!err) {
        // execFile ne fournit err que sur exit != 0 (ou spawn/timeout) : ici exit 0.
        resolve({ ok: true, status: TOUCHID.AUTHENTICATED, code: 0 });
        return;
      }

      const code = typeof err.code === "number" ? err.code : null;
      const status = code !== null ? STATUS_BY_EXIT_CODE[code] : undefined;

      if (status === TOUCHID.AUTHENTICATED) {
        // Ne devrait pas arriver (exit 0 n'est jamais une erreur pour execFile),
        // mais on refuse par construction : fail-closed avant tout.
        resolve({ ok: false, status: TOUCHID.ERROR, code, error: "code 0 inattendu en erreur" });
        return;
      }

      if (status) {
        resolve({ ok: false, status, code });
        return;
      }

      // Code inconnu, erreur de spawn (ENOENT...), ou timeout (err.killed/err.signal).
      resolve({ ok: false, status: TOUCHID.ERROR, code, error: err.message });
    });
  });
}
