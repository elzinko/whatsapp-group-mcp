#!/usr/bin/env node
// [fiche 0010] install-client — écrit le bloc whatsapp-group dans la config Claude Desktop,
// avec garde-fous. CLI lancée PAR L'HUMAIN : son geste au terminal EST le consentement, et
// le serveur MCP ne configure jamais un client lui-même (frontière fiche 0012).
//
// Garanties : n'écrase JAMAIS les autres serveurs (backup + fusion idempotente préservant
// tout le reste) ; refuse si Desktop tourne (l'app réécrirait le fichier) ; refuse si la
// config existante est un JSON malformé (on n'écrase pas ce qu'on ne comprend pas).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { config } from "../src/config.js";
import {
  nodeVersionOk,
  resolveStableNode,
  mergeMcpServer,
  desktopConfigPath,
} from "../src/setup.js";

const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};

const serverEntry = `${config.projectRoot}/src/index.js`;

// 1. node stable (+ warnings)
const stable = resolveStableNode((p) => fs.existsSync(p));
if (!nodeVersionOk(process.version)) console.error(`⚠️  node ${process.version} < 20 : le serveur exige ≥ 20.`);
if (stable.warning) console.error(`⚠️  ${stable.warning}`);

// 2. Desktop tourne ? (l'app réécrit sa config en direct -> l'ajout serait effacé)
let desktopRunning = false;
try {
  execFileSync("pgrep", ["-x", "Claude"], { stdio: "ignore" });
  desktopRunning = true;
} catch {
  /* pgrep exit != 0 => process non trouvé */
}
if (desktopRunning) {
  die("Claude Desktop tourne — quitte-le complètement (Cmd-Q), puis relance cette commande. Sinon l'app efface l'ajout.");
}

// 3-4. Config existante : LUE UNE SEULE FOIS. Pas de `existsSync` puis lecture/copie
// (ce check-puis-usage est une course TOCTOU — CodeQL js/file-system-race). Absente
// (ENOENT) -> config neuve ; illisible ou JSON malformé -> REFUS (on ne clobber jamais
// ce qu'on ne comprend pas). Le texte brut déjà lu sert de backup, sans re-lecture disque.
const cfgPath = desktopConfigPath();
let raw = null;
try {
  raw = fs.readFileSync(cfgPath, "utf8");
} catch (e) {
  if (e.code !== "ENOENT") die(`config Desktop illisible : ${e.message}`);
  // ENOENT : pas encore de config -> on en créera une neuve.
}

let existing = {};
if (raw !== null) {
  try {
    existing = JSON.parse(raw);
  } catch {
    die(`config Desktop présente mais JSON malformé (${cfgPath}) — corrige-la à la main d'abord, je refuse de l'écraser.`);
  }
  const bak = `${cfgPath}.bak`;
  fs.writeFileSync(bak, raw); // backup depuis le contenu déjà lu (aucune re-lecture)
  console.log(`↳ backup : ${bak}`);
}

// 5. Fusion idempotente (préserve tous les autres serveurs et clés) + écriture
const merged = mergeMcpServer(existing, "whatsapp-group", {
  command: stable.path,
  args: [serverEntry],
});
fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
fs.writeFileSync(cfgPath, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`✓ whatsapp-group branché dans Claude Desktop`);
console.log(`  ${cfgPath}`);
console.log(`  command: ${stable.path}`);
console.log("  → Rouvre Claude Desktop pour charger le serveur.");

// 6. Claude Code : imprimer la commande (ne pas écrire ~/.claude.json à la main)
console.log("\nPour Claude Code, lance :");
console.log(`  claude mcp add whatsapp-group -- ${stable.path} ${serverEntry}`);
