// Arrête TOUS les serveurs whatsapp-group-mcp en cours, d'où qu'ils viennent
// (npm start oublié dans un terminal, serveur lancé en arrière-plan par Claude
// Desktop ou Claude Code…). Un seul process à la fois peut tenir la session
// WhatsApp : `npm start` appelle ce script automatiquement (prestart).
//
// Sécurité du ciblage : on ne tue que les process dont l'EXÉCUTABLE est node et
// dont les arguments contiennent src/index.js. Jamais de pkill -f : la ligne de
// commande des clients Claude contient aussi ce chemin (dans leur config MCP),
// un motif trop large tuerait les sessions Claude elles-mêmes.

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Chemin ABSOLU de notre entrée. Comparer à la sous-chaîne "src/index.js" tuerait
// les serveurs d'autres projets portant ce chemin très banal (audit, défaut #3).
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = path.join(projectRoot, "src", "index.js");
const RELATIVE_ENTRY = path.join("src", "index.js"); // lancement depuis la racine du projet

let out = "";
try {
  out = execSync("ps -axo pid=,comm=,args=", { encoding: "utf8" });
} catch (e) {
  console.error("Impossible de lister les process :", e?.message);
  process.exit(1);
}

const victims = [];
for (const line of out.split("\n")) {
  const m = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/);
  if (!m) continue;
  const [, pid, comm, args] = m;
  if (Number(pid) === process.pid) continue;
  if (!(comm === "node" || comm.endsWith("/node"))) continue; // exclut les binaires Claude
  if (args.includes("scripts/stop.js")) continue; // pas nous-mêmes
  // Ciblage EXACT : on ne tue que NOTRE entrée, jamais un src/index.js homonyme
  // appartenant à un autre projet. On accepte la forme absolue et la forme relative
  // (lancement depuis la racine du projet), en découpant sur les arguments.
  const argv = args.split(/\s+/);
  const targetsUs = argv.some(
    (a) => a === ENTRY || path.resolve(projectRoot, a) === ENTRY || a === RELATIVE_ENTRY
  );
  if (!targetsUs) continue;
  victims.push({ pid: Number(pid), args: args.trim() });
}

if (victims.length === 0) {
  console.error("[stop] Aucun serveur whatsapp-group-mcp en cours.");
  process.exit(0);
}

for (const v of victims) {
  try {
    process.kill(v.pid, "SIGTERM");
    console.error(`[stop] Serveur arrêté (pid ${v.pid}) : ${v.args}`);
  } catch (e) {
    console.error(`[stop] Échec sur pid ${v.pid} : ${e?.message}`);
  }
}
