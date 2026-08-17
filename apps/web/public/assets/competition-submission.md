# Algorand x402 Global Challenge — PDC Submission
## Pacific Data Commons — Synergy Blockchain Pacific Limited

**Entry type:** Composite
**Submission window:** September 2026
**Leaderboard measurement window:** October 2026 (real Mainnet transaction volume)

> **Status:** figures and URLs below were confirmed live on 2026-08-18 — Supabase queries against the `pacific-data-commons` project, plus a direct HTTP check of every URL listed. No placeholders remain.

---

### Project Summary

Pacific Data Commons (PDC) is a library, a payment rail, and sovereign rights infrastructure for the Pacific, built by Synergy Blockchain Pacific (SBP), a Samoa-based blockchain infrastructure company. PDC is an x402-gated directory of Pacific data endpoints — fisheries, ocean, and governance/policy research to start — where AI agents and researchers pay USDC directly to the Pacific institutions that hold the data. SBP never touches the underlying data and never holds buyer or provider funds; it verifies identity, lists endpoints, and routes x402 payments.

The platform is live on Algorand Mainnet. 5 endpoints are registered and actively serving paid queries through a single pilot deployment, with real USDC settling per query via the GoPlausible facilitator. The submission also includes three practitioner working papers (governance sequencing, cryptographic continuity, and the gap between what Pacific governments are told about blockchain and what global financial standards actually run on) — themselves structured, queryable, x402-gated PDC endpoints, not just PDFs.

### Live Demonstration

Every URL below was checked directly (HTTP request, not assumed) on 2026-08-18:

- Pilot data endpoint: `https://pdcpilot-endpoint-production.up.railway.app` — confirmed live, registered in Supabase
- Directory API: `https://pdcdirectory-api-production.up.railway.app` — confirmed live
- Agent marketplace service: `https://pdcagents-production.up.railway.app` — confirmed live (`/health` returns `{"status":"ok","service":"pdc-agents"}`)
- Provider dashboard / web app: `https://pdcweb-production.up.railway.app` — confirmed live
- **Well-known discovery file** (`/.well-known/x402-directory.json`): `https://pdcdirectory-api-production.up.railway.app/.well-known/x402-directory.json` — confirmed live, returns 200 with real Supabase-backed stats (built Session 6, `apps/directory-api/src/routes/discovery.ts`). This is hosted on the directory API, not the web app — `pdcweb-production.up.railway.app/.well-known/x402-directory.json` returns 404, which is expected: the directory API is the canonical discovery host, since it's what search/rating/verification already point to.

### Registered Endpoints (5, confirmed via Supabase)

| Category | Title | Bazaar registered |
|---|---|---|
| Fisheries | Pacific Fisheries Status — SBP Pilot Endpoint | Yes |
| Ocean | Pacific Ocean Conditions — SBP Pilot Endpoint | Yes |
| Governance | Law Before Code (SBP-WP-2026-001) | Yes |
| Governance | Cryptographic Continuity (SBP-WP-2026-002) | Yes |
| Governance | Pacific Blockchain and Digital Asset Adoption Landscape 2026 | Yes |

A sixth endpoint — The Invisible Infrastructure (SBP-WP-2026-003) — shipped in code in Session 23 (`/research/invisible-infrastructure`) but its directory registration SQL has still not been applied as of this update; pending a Railway redeploy of `@pdc/pilot-endpoint`.

### Confirmed Mainnet Transactions

Pulled from `transactions_log` (Supabase project `poiiwcbriqwczmppoevd`) on 2026-08-18 (Session 24 refresh):

- **55 confirmed transactions**, **$0.55 total USDC volume**, spanning 2026-08-16 20:25 UTC to 2026-08-17 22:25 UTC
- All confirmed transactions to date are `summary`-tier ($0.01) queries against the fisheries endpoint

Most recent 5 transaction IDs:

| Algorand Transaction ID | Amount | Tier | Time (UTC) |
|---|---|---|---|
| 63E2QDXYNXP5JW2CWR5Z6VCRUZSHHXV5ANYDLAZFOKODGQ2YIUMQ | $0.01 | summary | 2026-08-17 22:25:36 |
| 7Y5D5M43FHLHMPL2BXIALN6FT345OVQEQZKOKSKLX5HGSBWUNQOA | $0.01 | summary | 2026-08-17 22:25:25 |
| R3Y2CFAV5YT74GVVHICRHPLR5G7O5C56EMKX2Y37TR3AEPSRZ3PA | $0.01 | summary | 2026-08-17 21:25:39 |
| WB5CUIZCC442JJMQXGBOFNU4ZY3RWSTBNOT35ATLCYNTJ4DNHNOA | $0.01 | summary | 2026-08-17 21:25:26 |
| TEJRVEU2ONW5CFYXCLHF7M46Y3J72UGKSBHRMXWDELDSRRAZ6UZA | $0.01 | summary | 2026-08-17 20:25:40 |

Volume to date is generated primarily by SBP's own demonstration agent (`@pdc/sbp-agent`, CLAUDE.md §26.3) running scheduled query cycles against the fisheries and ocean endpoints — real Mainnet settlement, not simulated, but not yet third-party design-partner volume. Growing third-party volume before the October leaderboard window is the design-partner programme's job (CLAUDE.md §23) and is not yet underway.

### Categories

Fisheries, ocean, and governance (3 structured research papers) — 5 endpoints total across those 3 categories as of this update.

### Competition Tag

`x402-global-challenge` applied to all 5 registered endpoints' `extra` field (confirmed via Supabase query).

### Bazaar Registration

All 5 endpoints show `bazaar_registered: true` in the directory. GoPlausible Bazaar discovery of the pilot endpoint's `/summary` route was confirmed indexed as of Session 22 (CLAUDE.md §26, "Session 22: Fix resource URL bug blocking Bazaar discovery"). Its other routes (`/slice`, `/full`, `/expert`, the three research routes) are registered in the directory but indexing by the Bazaar crawler beyond `/summary` has not been independently confirmed as of this update. The directory API's own routes (`/search`, `/endpoints`, `/external-sources`) currently declare no Bazaar discovery metadata at all — a separate, in-progress fix as of this update.

### What Makes This Entry Significant

PDC is not a demo built to win a hackathon — it's production infrastructure for a real institutional gap. Pacific SIDS are formally cautious about blockchain (rational, given fraudulent schemes going back to 2014 — see the accompanying Invisible Infrastructure working paper) while simultaneously being asked by the IMF, BIS, FATF, and IMO to implement digital infrastructure standards built, at the technical layer, on distributed ledger technology. PDC's data marketplace, its sovereign rights infrastructure design (Phase 2+, gated behind named-community consultation), and its accompanying practitioner research (three working papers, one co-authorship track underway with NUS/USP Law) are one practitioner's attempt to close that specific gap from inside a Pacific institution, not from outside it. Every architectural decision — no prepaid credits, no SBP custody of funds, no SBP administrative access to sovereign records, jurisdiction confined to the OGIP layer — is designed around Pacific institutional autonomy and data sovereignty, not just Algorand's technical capabilities.

### GitHub Repository

`github.com/Hamobcdev/pacific-data-commons` — visibility not verified as part of this draft (no GitHub auth available in the session that produced it); confirm current visibility before submission. If private, judges can request access.

---

*Prepared 2026-08-18, updated 2026-08-18 (Session 24) with live-verified URLs and refreshed transaction figures. Before submission: apply the Invisible Infrastructure endpoint registration SQL, confirm GitHub repository visibility (no `gh` auth available in the sessions that produced this document), add Bazaar discovery declarations to the directory API's own routes, and re-pull transaction figures for a submission-day-accurate count.*
