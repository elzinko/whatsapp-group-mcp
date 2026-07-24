#!/usr/bin/env node
// [fiche 0010] doctor — diagnostic LECTURE SEULE du branchement du serveur whatsapp-group.
// N'écrit RIEN. Jumeau exécutable de la Phase 0 (docs/tests/validation-manuelle-desktop.md).
// CLI autonome (pas le serveur MCP) : stdout est libre pour le rapport.

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { config } from "../src/config.js";
import { nodeVersionOk, resolveStableNode, desktopConfigPath } from "../src/setup.js";

const ok = (m) => console.log(`✅ ${m}`);
const warn = (m) => console.log(`⚠️  ${m}`);
const info = (m) => console.log(`   ${m}`);

console.log("— doctor whatsapp-group-mcp —\n");

// 1. node : version + chemin stable pour Desktop
if (nodeVersionOk(process.version)) ok(`node ${process.version} (≥ 20)`);
else warn(`node ${process.version} — le projet exige ≥ 20`);
const stable = resolveStableNode((p) => fs.existsSync(p));
if (stable.warning) warn(stable.warning);
else ok(`node stable pour Desktop : ${stable.path}`);

// 2. Claude Desktop branché ?
const desktopPath = desktopConfigPath();
try {
  const raw = fs.readFileSync(desktopPath, "utf8");
  try {
    const cfg = JSON.parse(raw);
    if (cfg?.mcpServers?.["whatsapp-group"]) ok("Claude Desktop : whatsapp-group branché");
    else warn("Claude Desktop : whatsapp-group ABSENT de mcpServers → « npm run install:client »");
  } catch {
    warn(`Claude Desktop : config présente mais JSON illisible (${desktopPath})`);
  }
} catch {
  warn(`Claude Desktop : aucune config à ${desktopPath} → « npm run install:client »`);
}

// 3. Claude Code branché ? (tolère l'absence de la CLI `claude`)
try {
  execFileSync("claude", ["mcp", "get", "whatsapp-group"], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  ok("Claude Code : whatsapp-group branché");
} catch {
  info("Claude Code : non détecté (ou CLI `claude` absente). Pour brancher :");
  info(`  claude mcp add whatsapp-group -- ${stable.path} ${config.projectRoot}/src/index.js`);
}

// 4. Session WhatsApp appairée ?
try {
  if (fs.readdirSync(config.authDir).length > 0) ok(`auth/ présent (appairé) : ${config.authDir}`);
  else warn(`auth/ vide — lance « npm start » et scanne le QR : ${config.authDir}`);
} catch {
  warn(`auth/ absent — lance « npm start » et scanne le QR : ${config.authDir}`);
}

// 5. Plafond
if (fs.existsSync(config.allowlistFile)) ok(`plafond présent : ${config.allowlistFile}`);
else info(`plafond ${config.allowlistFile} absent (généré au 1er démarrage)`);

console.log("\n(doctor ne modifie rien — pour configurer : npm run install:client)");
