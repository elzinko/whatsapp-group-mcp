// Tests du CONSENTEMENT par élicitation (ADR-0002), sans humain ni WhatsApp.
//
// Deux étages :
//   1. le contrat de buildConfirmGrant en isolation (faux serveur) ;
//   2. le VRAI protocole MCP : un vrai Server et un vrai Client du SDK, reliés par
//      un transport en mémoire — le client déclare la capability `elicitation` et
//      répond programmatiquement au formulaire. C'est la « lib de test » : le SDK
//      lui-même, scriptable des deux côtés.
//
// Ce que ces tests NE prouvent PAS (et ne prouveront jamais) : que la réponse vient
// d'un humain. Un test automatisé qui répond au formulaire est précisément un robot.
// Le dernier mètre — le rendu du formulaire dans Claude Code/Desktop et le doigt qui
// choisit Accept — se valide à la main (fiche 0001, mesuré OUI le 2026-07-18).

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { buildConfirmGrant } from "../src/consent.js";

let failed = false;
function check(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}`);
  if (!cond) failed = true;
}

const CHAN = { jid: "120363000000000000@g.us", subject: "Copro Reine Blanche" };

try {
  // --- 1) Contrat en isolation (faux serveur) ---
  const withServer = (impl, supported = true) =>
    buildConfirmGrant({ elicitInput: impl }, () => supported);

  let r = await withServer(async () => ({ action: "accept" }))(CHAN);
  check("accept -> consenti (via elicitation)", r.accepted === true && r.via === "elicitation");

  r = await withServer(async () => ({ action: "decline" }))(CHAN);
  check("decline -> refusé", r.accepted === false && /decline/.test(r.reason));

  r = await withServer(async () => ({ action: "cancel" }))(CHAN);
  check("cancel -> refusé", r.accepted === false);

  r = await withServer(async () => {
    throw new Error("client parti");
  })(CHAN);
  check("erreur de formulaire -> refusé (fail closed)", r.accepted === false);

  let elicitCalled = false;
  r = await withServer(async () => {
    elicitCalled = true;
    return { action: "accept" };
  }, false)(CHAN);
  check(
    "client sans élicitation -> repli permissions, formulaire jamais demandé",
    r.accepted === true && r.via === "client-permissions" && elicitCalled === false
  );

  let seenParams = null;
  await withServer(async (params) => {
    seenParams = params;
    return { action: "accept" };
  })(CHAN);
  check(
    "la question est rédigée par le serveur : nom + JID du groupe dans le message",
    seenParams?.message?.includes(CHAN.subject) && seenParams?.message?.includes(CHAN.jid)
  );
  check(
    "schéma sans champ requis (Accept/Decline suffisent)",
    Object.keys(seenParams?.requestedSchema?.properties || { x: 1 }).length === 0
  );

  // --- 2) Le vrai protocole : Server + Client SDK, transport en mémoire ---
  async function protocolRoundTrip({ declareCapability, respond }) {
    const server = new Server({ name: "t-server", version: "0.0.0" }, { capabilities: { tools: {} } });
    const client = new Client(
      { name: "t-client", version: "0.0.0" },
      { capabilities: declareCapability ? { elicitation: {} } : {} }
    );
    let received = null;
    if (declareCapability) {
      client.setRequestHandler(ElicitRequestSchema, async (req) => {
        received = req.params;
        return respond;
      });
    }
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const confirm = buildConfirmGrant(server, () => !!server.getClientCapabilities()?.elicitation);
    const result = await confirm(CHAN);

    await client.close();
    await server.close();
    return { result, received };
  }

  const accepted = await protocolRoundTrip({
    declareCapability: true,
    respond: { action: "accept", content: {} },
  });
  check(
    "protocole réel : capability négociée + formulaire reçu par le client",
    accepted.received?.message?.includes(CHAN.subject)
  );
  check(
    "protocole réel : accept du client -> grant consenti",
    accepted.result.accepted === true && accepted.result.via === "elicitation"
  );

  const declined = await protocolRoundTrip({
    declareCapability: true,
    respond: { action: "decline" },
  });
  check("protocole réel : decline du client -> refus", declined.result.accepted === false);

  const noCap = await protocolRoundTrip({ declareCapability: false });
  check(
    "protocole réel : client sans capability -> repli permissions",
    noCap.result.accepted === true && noCap.result.via === "client-permissions" && noCap.received === null
  );
} catch (e) {
  console.error("Erreur test:", e);
  failed = true;
}

console.log(failed ? "\n=== RÉSULTAT: ÉCHEC ===" : "\n=== RÉSULTAT: SUCCÈS ===");
process.exit(failed ? 1 : 0);
