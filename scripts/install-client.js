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

// 3. Config existante : REFUS si illisible/malformée (ne jamais clobber)
const cfgPath = desktopConfigPath();
let existing = {};
if (fs.existsSync(cfgPath)) {
  let raw;
  try {
    raw = fs.readFileSync(cfgPath, "utf8");
  } catch (e) {
    die(`config Desktop illisible : ${e.message}`);
  }
  try {
    existing = JSON.parse(raw);
  } catch {
    die(`config Desktop présente mais JSON malformé (${cfgPath}) — corrige-la à la main d'abord, je refuse de l'écraser.`);
  }
}

// 4. Backup avant écriture
if (fs.existsSync(cfgPath)) {
  const bak = `${cfgPath}.bak`;
  fs.copyFileSync(cfgPath, bak);
  console.log(`↳ backup : ${bak}`);
}

// 5. Fusion idempotente (préserve tous les autres serveurs et clés)
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
