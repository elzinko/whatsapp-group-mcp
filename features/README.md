# Backlog features & bugs — whatsapp-group-mcp

> Index **régénéré** depuis le front-matter des fiches (`ezk-backlog regen`) — ne pas éditer à la main.

## Actionnable (P0 → P3)

| # | Titre | Type | Prio | Statut | PR |
|---|---|---|---|---|---|
| [0001](0001-valider-adr-0002-conditions-reelles.md) | Valider l'ADR-0002 en conditions réelles (plafond, élicitation, lecture E2E) | chore | P0 | 🔴 todo | |
| [0008](0008-repli-sans-elicitation-fail-open.md) | Repli sans élicitation — trancher fail-open ou fail-closed (et le documenter) | feature | P1 | 🔴 todo | |
| [0003](0003-hygiene-locale-permissions-filevault.md) | Hygiène locale — permissions fichiers, FileVault, pas de dossier synchronisé | chore | P2 | 🔴 todo | |
| [0009](0009-verrou-exclusif-auth.md) | Verrou OS exclusif sur auth/ — garde-fou anti-collision entre process | feature | P2 | 🔴 todo | |
| [0012](0012-adr-serveur-ne-configure-pas-le-client.md) | ADR — le serveur MCP reste read-only et ne configure jamais le client | chore | P2 | 🔴 todo | |
| [0011](0011-outil-aide-mcp.md) | Aide déclenchée — outil (et prompt) « comment j'utilise ce MCP ? » | feature | P3 | 🔴 todo | |

## ⛔ Bloquées

| # | Titre | Type | Prio | Bloquée par |
|---|---|---|---|---|
| [0002](0002-article-mes-messages-mes-agents-et-moi.md) | Article : « La question que le LLM ne peut pas trafiquer » | feature | P1 | choix du support de publication (texte validé) |

## 🧭 Épics (jamais tirables directement)

| # | Titre | Prio | Statut |
|---|---|---|---|
| [0005](0005-demon-frontends-mcp.md) | Démon unique + frontends MCP minces (phase 2 — multi-clients simultanés) | P3 | 💡 idea |
| [0006](0006-app-mobile-tokens.md) | Accès réseau pour l'app mobile — tokens à capabilities, TLS/Tailscale (phase 3) | P3 | 💡 idea |

## 💡 Idées (non groomées)

| # | Titre | Type | Prio |
|---|---|---|---|
| [0004](0004-profils-par-projet.md) | Profils par projet (.mcp.json → profil nommé, effectif = plafond ∩ profil) | feature | P2 |
| [0007](0007-elicitation-signee-touch-id.md) | Élicitation signée — consentement par authentification physique (Touch ID / Secure Enclave) | feature | P3 |

## ✅ Livrées

| # | Titre | Type | Prio | Réf |
|---|---|---|---|---|
| [0013](done/0013-garde-touchid-presence-grant.md) | Garde Touch ID (presence check) sur grant_channel | feature | P2 | poussé `bf2df7f` |
| [0010](done/0010-installer-doctor-cli.md) | Installer / doctor en CLI (check node, chemin absolu, config idempotente) | feature | P2 | merge local `8b99874` |

---

Compteurs : 11 fiches actives — 6 todo (0 ready) · 0 in-progress · 4 idea (dont 2 épics) · 1 blocked · 2 shipped (dans done/).
