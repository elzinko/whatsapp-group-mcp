#!/usr/bin/env node
// CLI HUMAINE pour le registre de sessions (fiche 20260902223310499 — droits par
// session). La source de vérité est le FICHIER (sessions/<id>.json) : toute
// révocation ici est effective immédiatement, sans redémarrer aucun serveur MCP
// déjà connecté (chaque lecture y résout le jeton à frais).
//
//   npm run sessions -- list
//   npm run sessions -- close <id>
//   npm run sessions -- close --all
//   npm run sessions -- open --channels <jid1,jid2,...> [--ttl <durée>]
//
// `open` sert le consommateur SCRIPTÉ (ex. elzinko/elzinko, PR #17) : Touch ID
// une fois (drapeau strong-auth ON requis — cette CLI n'a pas de client MCP à qui
// proposer une élicitation), puis le jeton est imprimé SEUL sur stdout, prêt à
// être capturé dans une variable d'environnement par le script consommateur.

import { config } from "../src/config.js";
import { Settings } from "../src/settings.js";
import { Allowlist } from "../src/allowlist.js";
import { SessionRegistry } from "../src/sessions.js";
import { buildSessionConsent } from "../src/consent.js";
import { readStrongAuthEnabled } from "../src/strongauth.js";
import { checkPresence } from "../src/touchid.js";

const settings = new Settings(config.settingsFile).load();
const allowlist = new Allowlist(config.allowlistFile).load();
const sessions = new SessionRegistry(config.sessionsDir, { defaultTtlMs: config.sessionTtlMs });

function ceilingHas(jid) {
  allowlist.refresh();
  const subject = settings.grants.get(jid)?.subject ?? null;
  return allowlist.match(jid, subject) !== null;
}

// Résout un JID exact ou un nom de groupe DÉJÀ AUTORISÉ (settings.json). Cette
// CLI n'ouvre pas de connexion WhatsApp : elle ne connaît pas les groupes non
// encore captés — c'est voulu (session_open exige déjà grants ∩ plafond).
function resolveToJid(raw) {
  const v = String(raw || "").trim();
  if (!v) throw new Error("canal vide");
  if (v.endsWith("@g.us")) return v;
  const target = v.toLowerCase();
  for (const g of settings.list()) {
    if ((g.subject || "").trim().toLowerCase() === target) return g.jid;
  }
  throw new Error(
    `Groupe « ${v} » introuvable parmi les canaux déjà autorisés (settings.json). ` +
      `Utilise le JID exact (…@g.us), ou autorise-le d'abord (grant_channel).`
  );
}

const DURATION_FACTOR = { ms: 1, s: 1000, m: 60000, min: 60000, h: 3600000, d: 86400000 };

function parseDuration(raw) {
  if (!raw) return config.sessionTtlMs;
  const m = String(raw).trim().match(/^(\d+)\s*(ms|s|m|min|h|d)?$/i);
  if (!m) throw new Error(`Durée invalide : « ${raw} » (ex : 8h, 30d, 3600000).`);
  const factor = DURATION_FACTOR[(m[2] || "ms").toLowerCase()];
  return Number(m[1]) * factor;
}

function subjectFor(jid) {
  return settings.grants.get(jid)?.subject || jid;
}

function printSession(s) {
  console.log(`${s.id}`);
  console.log(`  canaux : ${s.channels.map((j) => `${subjectFor(j)} (${j})`).join(", ") || "(aucun)"}`);
  console.log(`  ouverte  : ${s.createdAt}`);
  console.log(`  expire   : ${s.expiresAt}`);
  console.log(`  vue pour la dernière fois : ${s.lastSeenAt}`);
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1] ?? null;
}
function has(args, name) {
  return args.includes(`--${name}`);
}

function usage() {
  console.error(
    "Usage :\n" +
      "  npm run sessions -- list\n" +
      "  npm run sessions -- close <id>\n" +
      "  npm run sessions -- close --all\n" +
      "  npm run sessions -- open --channels <jid1,jid2,...> [--ttl <durée>]"
  );
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "list": {
      const list = sessions.list();
      if (list.length === 0) {
        console.log("Aucune session active.");
        return 0;
      }
      console.log(`${list.length} session(s) active(s) :\n`);
      for (const s of list) printSession(s);
      return 0;
    }

    case "close": {
      if (has(rest, "all")) {
        const list = sessions.list();
        for (const s of list) sessions.close(s.id);
        console.log(`${list.length} session(s) fermée(s).`);
        return 0;
      }
      const id = rest.find((a) => !a.startsWith("--"));
      if (!id) {
        usage();
        return 1;
      }
      const closed = sessions.close(id);
      console.log(closed ? `Session ${id} fermée.` : `Session ${id} introuvable (déjà close, ou expirée).`);
      return closed ? 0 : 1;
    }

    case "open": {
      const raw = flag(rest, "channels");
      const channelsRaw = (raw || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (channelsRaw.length === 0) {
        usage();
        return 1;
      }

      let jids;
      try {
        jids = channelsRaw.map(resolveToJid);
      } catch (e) {
        console.error(e.message);
        return 1;
      }

      // ⊆ grants ∩ plafond AVANT tout prompt — même garde que session_open côté MCP.
      const denied = jids.filter((jid) => !settings.has(jid) || !ceilingHas(jid));
      if (denied.length > 0) {
        console.error(
          `Refusé avant tout prompt : hors grants ∩ plafond -> ${denied.map(subjectFor).join(", ")}`
        );
        return 1;
      }

      let ttlMs;
      try {
        ttlMs = parseDuration(flag(rest, "ttl"));
      } catch (e) {
        console.error(e.message);
        return 1;
      }

      const subjects = jids.map(subjectFor);
      const strongAuthOn = readStrongAuthEnabled(config.strongAuthFile);
      const consent = buildSessionConsent({
        isStrongAuthEnabled: () => strongAuthOn,
        checkPresence,
        // Cette CLI n'a pas de client MCP à qui présenter un formulaire.
        isElicitationSupported: () => false,
        server: null,
        log: (...a) => console.error("[sessions]", ...a),
      });

      const res = await consent({ subjects, ttlMs });
      if (!res.accepted) {
        console.error(
          `Session refusée${res.reason ? ` (${res.reason})` : ""}.` +
            (strongAuthOn
              ? ""
              : " Cette CLI exige le drapeau Touch ID (strong-auth.json: {\"enabled\":true}) " +
                "car elle ne présente pas de formulaire d'élicitation.")
        );
        return 1;
      }

      const session = sessions.create(jids, ttlMs);
      console.log(session.id); // seul sur stdout : facile à capturer dans une variable
      console.error(`Session ouverte pour : ${subjects.join(", ")} — expire ${session.expiresAt}`);
      return 0;
    }

    default:
      usage();
      return 1;
  }
}

main().then(
  (code) => process.exit(code || 0),
  (e) => {
    console.error("Erreur :", e?.message || e);
    process.exit(1);
  }
);
