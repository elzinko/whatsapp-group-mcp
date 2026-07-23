// Helpers pour les CLI de branchement (doctor / install-client), fiche 0010.
//
// Fonctions PURES et testables : aucune I/O cachée (fs/exec injectés par l'appelant
// dans les tests). Ce ne sont PAS des outils MCP — le serveur (src/index.js) ne
// configure JAMAIS un client (frontière fiche 0012) ; ici c'est une CLI lancée par
// l'humain, son geste au terminal EST le consentement.

import path from "node:path";
import os from "node:os";

// node ≥ min ? Parse "v22.18.0" -> 22. Format inattendu -> false (fail-safe).
export function nodeVersionOk(versionString, min = 20) {
  const m = /^v?(\d+)\./.exec(String(versionString || ""));
  if (!m) return false;
  return Number(m[1]) >= min;
}

// Résout un node en chemin ABSOLU STABLE : Claude Desktop lance les serveurs MCP avec
// un PATH minimal (sans nvm ni Homebrew), donc "node" nu ou un chemin nvm versionné
// échoue. Ordre : Homebrew, /usr/local, /usr/bin. `existsFn` injectée pour test.
// Aucun trouvé -> process.execPath + warning (souvent nvm, instable pour Desktop).
const STABLE_NODE_CANDIDATES = [
  "/opt/homebrew/bin/node",
  "/usr/local/bin/node",
  "/usr/bin/node",
];

export function resolveStableNode(existsFn, execPath = process.execPath) {
  for (const candidate of STABLE_NODE_CANDIDATES) {
    if (existsFn(candidate)) return { path: candidate, warning: null };
  }
  return {
    path: execPath,
    warning:
      "node introuvable en chemin stable (/opt/homebrew, /usr/local, /usr/bin) — " +
      "probablement nvm ; Claude Desktop (PATH minimal) risque de ne pas le trouver.",
  };
}

// Fusionne un serveur MCP dans une config client SANS rien écraser d'autre.
// PUR : renvoie un NOUVEL objet, ne mute ni `config` ni `entry`. Préserve les autres
// serveurs ET les autres clés racine (preferences…). C'est LE point critique : ne
// jamais clobber la config existante de l'utilisateur (qui peut contenir des secrets).
export function mergeMcpServer(config, name, entry) {
  const base = config && typeof config === "object" ? config : {};
  const servers =
    base.mcpServers && typeof base.mcpServers === "object" ? base.mcpServers : {};
  return {
    ...base,
    mcpServers: {
      ...servers,
      [name]: { ...entry },
    },
  };
}

// Chemin de la config Claude Desktop (macOS).
export function desktopConfigPath(home = os.homedir()) {
  return path.join(
    home,
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json"
  );
}
