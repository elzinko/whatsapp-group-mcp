// Consentement humain pour un grant (ADR-0002) : quand le client MCP supporte
// l'élicitation, la question est RÉDIGÉE PAR LE SERVEUR et la réponse (Accept /
// Decline) ne transite jamais par le LLM. Extrait de index.js pour être testable
// sans WhatsApp ni process serveur — voir test/elicitation.js.
//
// `isElicitationSupported` est un getter (pas un booléen) : la capability du client
// n'est connue qu'après le handshake, alors que ce module est câblé avant.

export function buildConfirmGrant(server, isElicitationSupported, log = () => {}) {
  return async ({ jid, subject }) => {
    if (!isElicitationSupported()) {
      return { accepted: true, via: "client-permissions" };
    }
    try {
      // Pas de champ à remplir : Accept/Decline SONT la réponse. Un booléen en plus
      // serait redondant et pénible à cocher au clavier (vécu, fiche 0001).
      const res = await server.elicitInput({
        message:
          `Le LLM demande l'accès en LECTURE au groupe WhatsApp « ${subject} » (${jid}). ` +
          `Ce canal est dans ton plafond (allowlist.json). ` +
          `Accept = autoriser la lecture (révocable à tout moment) · Decline = refuser.`,
        requestedSchema: { type: "object", properties: {} },
      });
      if (res?.action === "accept") {
        return { accepted: true, via: "elicitation" };
      }
      return { accepted: false, reason: `formulaire ${res?.action || "sans réponse"}` };
    } catch (e) {
      // Fail closed : si le formulaire n'a pas pu être présenté, on n'accorde rien.
      log("Élicitation impossible :", e?.message);
      return { accepted: false, reason: "le formulaire de consentement n'a pas pu être affiché" };
    }
  };
}

// Garde Touch ID sur grant_channel (ADR-0003), au-dessus de l'élicitation (ADR-0002) :
// quand le drapeau strong-auth est ON, seule une présence physique authentifiée
// (Touch ID / Watch / mot de passe de session) consent le grant — FAIL CLOSED sur
// tout ce qui n'est pas un succès explicite (refus, indisponibilité, erreur, timeout).
// Quand il est OFF, comportement ADR-0002 inchangé (élicitation ou repli permissions).
export function buildGrantConsent({
  isStrongAuthEnabled,
  checkPresence,
  elicitationConsent,
  log = () => {},
}) {
  return async ({ jid, subject }) => {
    if (isStrongAuthEnabled()) {
      const reason = `Autoriser la lecture du groupe WhatsApp « ${subject} » ?`;
      let res;
      try {
        res = await checkPresence({ reason });
      } catch (e) {
        // Fail closed : toute exception de la cérémonie = refus (comme buildConfirmGrant).
        log("Touch ID: cérémonie impossible :", e?.message);
        return { accepted: false, reason: "Touch ID: cérémonie impossible" };
      }
      if (res?.ok) return { accepted: true, via: "touchid" };
      log("Touch ID refusé :", res?.status || "échec");
      return { accepted: false, reason: `Touch ID: ${res?.status || "échec"}` };
    }
    return elicitationConsent({ jid, subject }); // OFF -> comportement ADR-0002 inchangé
  };
}

// Consentement de `session_open` (fiche 20260902223310499 — droits par session).
// Composé comme buildGrantConsent (ADR-0003), avec UNE différence volontaire :
// pas de repli « permissions client ». Un grant est déjà borné par le plafond ;
// une session OUVRE un périmètre neuf, elle mérite une garantie plus forte. Un
// client qui ne peut pas présenter de formulaire, drapeau strong-auth OFF,
// n'ouvre RIEN — fail-closed plutôt que le fail-open de la fiche 0008.
export function buildSessionConsent({
  isStrongAuthEnabled,
  checkPresence,
  isElicitationSupported,
  server,
  humanDuration = (ms) => `${Math.round(ms / 3600000)} h`,
  log = () => {},
}) {
  return async ({ subjects, ttlMs }) => {
    const names = subjects.map((s) => `« ${s} »`).join(", ");
    const reason = `Ouvrir une session de lecture WhatsApp sur ${names} pendant ${humanDuration(ttlMs)} ?`;

    if (isStrongAuthEnabled()) {
      let res;
      try {
        res = await checkPresence({ reason });
      } catch (e) {
        log("Touch ID: cérémonie impossible :", e?.message);
        return { accepted: false, reason: "Touch ID: cérémonie impossible" };
      }
      if (res?.ok) return { accepted: true, via: "touchid" };
      log("Touch ID refusé :", res?.status || "échec");
      return { accepted: false, reason: `Touch ID: ${res?.status || "échec"}` };
    }

    if (!isElicitationSupported()) {
      // PAS de repli « permissions client » ici : voir le commentaire d'en-tête.
      return {
        accepted: false,
        reason:
          "drapeau strong-auth désactivé et le client ne supporte pas l'élicitation : " +
          "aucun consentement vérifiable n'est disponible, la session n'est pas ouverte",
      };
    }

    try {
      const res = await server.elicitInput({
        message: `${reason} Accept = ouvrir la session · Decline = refuser.`,
        requestedSchema: { type: "object", properties: {} },
      });
      if (res?.action === "accept") return { accepted: true, via: "elicitation" };
      return { accepted: false, reason: `formulaire ${res?.action || "sans réponse"}` };
    } catch (e) {
      log("Élicitation impossible :", e?.message);
      return { accepted: false, reason: "le formulaire de consentement n'a pas pu être affiché" };
    }
  };
}
