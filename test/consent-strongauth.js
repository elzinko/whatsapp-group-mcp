// Tests de src/consent.js#buildGrantConsent (ADR-0003) : garde Touch ID sur
// grant_channel, hiérarchie au-dessus de l'élicitation (ADR-0002).
//
// Biométrie MOCKÉE : checkPresence est une dépendance injectée, comme dans
// test/touchid.js. Le dernier mètre (vrai doigt, vraie boîte Touch ID) reste
// non-automatisable par construction (cf. test/elicitation.js).

import { buildGrantConsent } from "../src/consent.js";
import { TOUCHID } from "../src/touchid.js";

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

const CHAN = { jid: "120363000000000000@g.us", subject: "Copro Reine Blanche" };

function build({ enabled, checkPresence, elicitationResult }) {
  return buildGrantConsent({
    isStrongAuthEnabled: () => enabled,
    checkPresence,
    elicitationConsent: async () => elicitationResult,
  });
}

try {
  // --- ON + succès Touch ID -> consenti via touchid ---
  let seenReason = null;
  let confirm = build({
    enabled: true,
    checkPresence: async ({ reason }) => {
      seenReason = reason;
      return { ok: true, status: TOUCHID.AUTHENTICATED, code: 0 };
    },
  });
  let r = await confirm(CHAN);
  check(
    "ON + checkPresence ok -> {accepted:true, via:'touchid'}",
    r.accepted === true && r.via === "touchid"
  );
  check("le reason passé à checkPresence nomme le canal (subject)", seenReason?.includes(CHAN.subject));

  // --- ON + refus explicite -> fail-closed ---
  confirm = build({
    enabled: true,
    checkPresence: async () => ({ ok: false, status: TOUCHID.REFUSED }),
  });
  r = await confirm(CHAN);
  check("ON + checkPresence refused -> {accepted:false} (fail-closed)", r.accepted === false);

  // --- ON + erreur/timeout -> fail-closed ---
  confirm = build({
    enabled: true,
    checkPresence: async () => ({ ok: false, status: TOUCHID.ERROR, error: "timeout" }),
  });
  r = await confirm(CHAN);
  check("ON + checkPresence error/timeout -> {accepted:false} (fail-closed)", r.accepted === false);

  // --- ON + checkPresence renvoie undefined -> fail-closed (res?.ok falsy) ---
  confirm = build({ enabled: true, checkPresence: async () => undefined });
  r = await confirm(CHAN);
  check("ON + checkPresence -> undefined -> {accepted:false} (fail-closed)", r.accepted === false);

  // --- ON + checkPresence JETTE -> fail-closed, jamais accepted:true ---
  confirm = build({
    enabled: true,
    checkPresence: async () => {
      throw new Error("helper Swift introuvable");
    },
  });
  r = await confirm(CHAN);
  check(
    "ON + checkPresence throw -> {accepted:false} (fail-closed, jamais accepted:true)",
    r.accepted === false
  );

  // --- OFF -> délègue à elicitationConsent, retourne SON résultat inchangé ---
  const elicitationResult = { accepted: true, via: "elicitation" };
  let elicitationCalledWith = null;
  confirm = buildGrantConsent({
    isStrongAuthEnabled: () => false,
    checkPresence: async () => {
      throw new Error("ne doit jamais être appelé quand OFF");
    },
    elicitationConsent: async (args) => {
      elicitationCalledWith = args;
      return elicitationResult;
    },
  });
  r = await confirm(CHAN);
  check(
    "OFF -> délègue à elicitationConsent et renvoie SON résultat inchangé",
    r === elicitationResult
  );
  check("OFF -> l'élicitation reçoit bien jid/subject", elicitationCalledWith?.jid === CHAN.jid);
} catch (e) {
  console.error("Erreur test:", e);
  failed = true;
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
