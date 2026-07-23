---
id: 0013
title: Garde Touch ID (presence check) sur grant_channel — v1, portée de google-mcp
type: feature
priority: P2
version:
epic:
status: shipped
ready: 2026-07-22
pr: "merge local e096a7a (non poussé)"
created: 2026-07-22
---

## Contexte / Problème

Le projet voisin `google-mcp-multi-account` a **livré** (2026-07-19) un garde biométrique
**presence check** — vérifié dans le code le 2026-07-22 :
- `scripts/touchid.swift` (~27 lignes) : `LAContext.evaluatePolicy(.deviceOwnerAuthentication)`
  → boîte système Touch ID / Apple Watch / mot de passe macOS, exit 0/1/2 ;
- `bin/gwsa` → `require_strong_auth()` : si le drapeau `.strong-auth` existe, lance le helper
  **avant** `unlock`, `grant`, `add` ;
- `gwsa strongauth on|off|status`.

Ce que ça prouve : **un humain était physiquement devant le Mac** au moment de l'action —
un LLM ne peut pas fabriquer ce verdict.

whatsapp a la fiche du cran **au-dessus** ([0007](0007-elicitation-signee-touch-id.md),
signature Secure Enclave liée à la question) mais **pas** ce cran v1. Or il tombe
particulièrement bien ici : un garde Touch ID sur `grant_channel` est **imposé côté serveur**,
donc **indépendant de la capability du client** — il **fermerait le trou de la fiche 0008**
(repli fail-open sur les clients sans élicitation) et exigerait une **présence physique**
pour tout grant, ce qui contre directement le mandataire zélé.

## ⛔ Question qui décide de la faisabilité (à mesurer en réel avant tout code)

**Un serveur MCP stdio, lancé par Claude Desktop (ou Code), peut-il AFFICHER la boîte
Touch ID ?** Chez google-mcp, elle part de `gwsa` — un CLI en terminal, dans la session GUI
de l'utilisateur. Ici, `grant_channel` s'exécute dans le process serveur stdio, enfant du
client. Plausible (même session GUI) mais **non prouvé**. À relever en conditions réelles,
exactement comme l'élicitation l'a été (fiche 0001) :
- **Si oui** → garde serveur excellent, client-indépendant. Priorité potentielle P1.
- **Si non** → repli à trancher (grant par CLI humaine = régression UX de la conversation ;
  ou garder l'élicitation + décision 0008). Ne pas passer le gate `ready` avant ce relevé.

**✅ RELEVÉ (2026-07-22) — faisabilité CONFIRMÉE.** Le helper `scripts/touchid.swift`,
déclenché depuis un process enfant d'une session Claude Code, a **présenté la boîte système
Touch ID** (observée par Thomas) et renvoyé `authenticated` (exit 0). `evaluatePolicy` ne
réussit que si un prompt a été présenté ET validé → la boîte s'affiche bien depuis un process
enfant de la session du client. **Réserve mineure** : testé via l'outil Bash (enfant du CLI
Claude Code), pas encore depuis le process serveur MCP lui-même ni sous Desktop — contexte au
moins aussi contraint, risque résiduel faible, à lever *in situ* quand la feature sera testée.
⇒ **0013 débloquée : la feature complète est viable.**

## Proposition (groomée le 2026-07-22 — faisabilité confirmée)

Base déjà livrée au spike : `scripts/touchid.swift` (presence check) + `src/touchid.js`
(wrapper fail-closed, swift en chemin absolu). Reste à **câbler dans `grant_channel`** :

- **Activation : drapeau, défaut ON** (fourche PO tranchée). Touch ID exigé sur chaque grant
  dès l'installation quand la biométrie/mot de passe est disponible.
- **Le drapeau est *human-only*** : fichier à côté d'`allowlist.json`, **aucun outil MCP ne
  le bascule** — sinon un LLM confus le couperait (même doctrine que le plafond, ADR-0002).
- **Le Touch ID remplace l'élicitation** quand actif : le doigt EST le consentement. La boîte
  **nomme le canal** (« Autoriser la lecture du groupe WhatsApp « X » ? »). Drapeau OFF →
  comportement d'élicitation actuel inchangé (le cas fail-open reste la décision de 0008).
- **Ordre** : plafond vérifié **d'abord**, Touch ID **ensuite** (pas de prompt pour un
  canal hors-plafond qui sera refusé de toute façon).
- **Fail-closed** : cérémonie refusée/échouée → grant refusé. Pas de lockout (repli mot de
  passe macOS via `.deviceOwnerAuthentication`).
- **Périmètre** : `grant_channel` seulement — pas les lectures, pas `revoke_channel`.
- **ADR** : tracer la hiérarchie de consentement (permissions client < élicitation < Touch ID)
  et amender l'ADR-0002.

## Critères d'acceptation

- [x] Faisabilité relevée + **E2E in situ CONFIRMÉ (2026-07-22)** : la boîte Touch ID
      s'affiche sur un vrai grant, depuis le vrai serveur MCP, en nommant le canal (relevé Thomas)
- [x] Drapeau d'activation **human-only, défaut ON** ; **aucun outil MCP ne le bascule**
- [x] Drapeau ON : `grant_channel` n'accorde qu'après un verdict biométrique positif ; la boîte **nomme le canal**
- [x] **Fail-closed** : refus/échec de la cérémonie → grant refusé (jamais d'accord silencieux)
- [x] Plafond vérifié **avant** le prompt Touch ID (pas de prompt pour un hors-plafond)
- [x] Drapeau OFF → comportement d'élicitation actuel **inchangé**
- [x] `revoke_channel` et les lectures **non impactés**
- [x] Tests : contrat du wrapper + intégration `grant_channel` (drapeau ON/OFF, fail-closed) — 9 suites vertes ; la biométrie reste un relevé humain (E2E, fait)
- [x] ADR : hiérarchie de consentement + amendement ADR-0002 ; drapeau documenté au README

## Notes

- **Décision PO (2026-07-22)** : fiche tirée **non-ready en soupape PO**, sous forme de
  **spike de faisabilité** (pas la feature complète) — sur directive « build en suivant
  l'ordre proposé ». Justifié : la DoR exige le relevé de faisabilité *avant* le gate
  `ready`, or ce relevé EST l'objet du spike (chicken/egg). Périmètre : helper
  `touchid.swift` + wrapper Node + sonde manuelle ; **câblage dans `grant_channel` hors
  périmètre** (feature complète ultérieure, une fois la faisabilité tranchée).
- **Relation à 0007** : ceci est le **v1 (presence check)** ; 0007 est le **v2 (signé,
  Secure Enclave, liaison à la question)**. Pour un serveur **read-only** dont le pire cas
  est « tu lis tes propres messages », le presence check est probablement **proportionné** ;
  0007 devient du gold-plating, pertinent surtout le jour où une écriture existerait. À
  arbitrer — ne pas construire le signé avant d'avoir éprouvé le presence check.
- Symétrie avec google-mcp : eux ont livré le v1 et attendent whatsapp 0007 pour le v2 signé ;
  ici on ferait le v1 en second, le v2 (0007) en pionnier. Les deux fiches se citent.
- Prior art : `/Users/elzinko/git/google-mcp-multi-account/scripts/touchid.swift`,
  `bin/gwsa` (`require_strong_auth`), README §« Authentification forte (Touch ID) ».
