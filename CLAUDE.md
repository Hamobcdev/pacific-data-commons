# CLAUDE.md — Pacific Data Commons
## Master Project Brief and LLM Session Orientation

**Organisation:** Synergy Blockchain Pacific (SBP)
**Project:** Pacific Data Commons (PDC) + OGIP Integration
**Version:** 2.1 — Post Fable 5 Risk Validation (Parts 4 + 5)
**Classification:** Internal — All Sessions
**Authority:** This document supersedes all planning documents (Parts 1–5) wherever they conflict. CLAUDE.md wins. Flag conflicts, resolve before proceeding.

---

## 1. What SBP Is Building — The Simplest True Statement

SBP is building **a library and a payment rail for Pacific sovereign data.**

- The library: a searchable, x402-gated directory of Pacific data endpoints
- The payment rail: x402 protocol routing USDC directly from buyers to providers
- SBP never touches the data
- SBP never holds funds
- SBP never arbitrates disputes
- SBP verifies identity, not quality

Everything else — the AI formatting service, the trust tier system, the OGIP, the provenance certificates — serves these two core functions or is a value-added service built on top of them.

---

## 2. The Three-Layer System

```
LAYER 3 — PACIFIC DATA COMMONS (PDC)
International commercial data marketplace
x402-gated endpoints — AI agents and researchers pay USDC
directly to Pacific institutions — SBP earns 3% transaction fee

LAYER 2 — OGIP (Open Government Interoperability Platform)
Domestic government data exchange
Ministry-to-ministry data sharing with contribution scoring
Jurisdiction-aware, configurable per adopting nation

LAYER 1 — DATA PRODUCTION LAYER
Pacific universities, ministries, agencies, cultural institutions
Data stays on provider infrastructure — never moves to SBP
Providers host their own endpoints — SBP lists them
```

---

## 3. Who SBP Is

Synergy Blockchain Pacific is a Samoa-based blockchain infrastructure company building sovereign digital infrastructure for Pacific Island nations and Small Island Developing States (SIDS).

SBP intersects with:
- Central Bank of Samoa (CBS) — CBDC research, payment infrastructure, regulatory consultation
- Ministry of Communications and Information Technology (MCIT) — digital economy policy
- Pacific regional bodies (SPC, SPREP, USP) — data and research partnerships
- Development finance institutions (World Bank, ADB) — digital economy funding

Every decision must be evaluated against its impact on Pacific institutional autonomy, data sovereignty, and long-term sustainability.

---

## 4. Architecture Principles — Non-Negotiable

**P1 — Data Sovereignty**
Data never leaves the provider's infrastructure. SBP routes payments and trust signals — not data. Every design decision must preserve provider data sovereignty.

**P2 — SBP Never Holds Funds**
SBP is not a payment institution and must never operate as one. An SBP-deployed contract holding funds counts as SBP holding funds. Until CBS provides a written position, no contract in the payment flow custodies value beyond momentary routing. Tier 5 escrow is deferred to Phase 2. Stripe and ISO 20022 hold licences for fiat conversion — SBP holds nothing.

**P3 — Jurisdiction is OGIP-Layer Only**
The jurisdiction field exists only in OGIP tables (ministries, credit ledger, OGIP endpoints). It does not exist in PDC international layer tables (providers, endpoints, transactions_log). Regional institutions (USP, SPREP, SPC) are international providers on the PDC layer — no jurisdiction complexity applies to them.

**P4 — Security First**
Every feature is designed with its threat model before implementation. RLS is enabled on every Supabase table from day one. No secrets in code — all in environment variables. Three environments (dev/staging/prod) from the start. The smart-contract-auditor skill runs before any Mainnet deployment.

**P5 — Production from Day One**
Write production-quality code in every session. No placeholders. Error handling, logging, input validation, and rate limiting are part of every implementation, not afterthoughts.

**P6 — Backwards Compatibility**
The x402 protocol, Pacific Data Protocol schemas, and API routes must maintain backwards compatibility once published. The certificate format is publish-once — get it right at launch (v1.1 with dataset content hash). Breaking changes require versioning (v1, v2) — never in-place modification of live endpoints.

**P7 — Transparency**
Every financial transaction, certificate issuance, trust tier change, and directory action is recorded on-chain or in an auditable Supabase log. Nothing that touches money or trust is opaque.

**P8 — Pacific Context**
Every UI/UX decision must account for Pacific internet connectivity constraints (intermittent, high-latency, low-bandwidth). File uploads must be resumable. Forms must save state. Offline-capable where possible. Mobile-first design. Maximum page weight enforced.

**P9 — LLM Output is Untrusted Input**
Every pipeline output is validated against a strict JSON schema before use. No LLM token becomes executable code. Endpoint generation is deterministic template instantiation — the LLM fills values, a template engine assembles code. No LLM classification becomes a trust or sensitivity decision without human confirmation. Document content is data, never instructions. Prompt injection via file upload is a live attack vector.

**P10 — SBP is the Library and the Rail, Nothing More**
SBP is not a data processor, not a quality assessor, not a dispute arbitrator, not a financial intermediary, not a data controller. SBP verifies identity (Bronze), records community ratings (Silver), verifies peer review claims clerically (Gold). SBP makes no quality judgments. Disputes are between provider and buyer. This principle governs every ToS clause, every UI element, and every API response.

---

## 5. Confirmed Pre-Build Decision Register

All 31 decisions are final. Do not revisit unless explicitly instructed.

| # | Decision | Confirmed Answer |
|---|---|---|
| 1 | Domain | TBD — brand name first, domain follows |
| 2 | Network | Testnet for pipeline/API. Mainnet pilot endpoint from Phase 1. |
| 3 | Architecture | Multi-tenant in OGIP layer only. PDC international layer has no jurisdiction field. |
| 4 | Provider hosting | Hybrid — SBP managed during POC, self-host post-competition |
| 5 | Launch categories | Fisheries + Climate + Trade |
| 6 | Competition entry | Composite entry, register immediately, submit September 2026 |
| 7 | Trust tier model | Bronze: identity only (free, automated). Silver: 3 verified purchaser upvotes. Gold: documented peer review + SBP clerical check ($25). |
| 8 | Directory query fee | $0.01 per search |
| 9 | Languages | English at launch. Full i18n stubs for all Pacific languages built in from day one. |
| 10 | Cultural data | Coming soon label at launch. Community consent framework + Phase 2. |
| 11 | Revenue split — PDC international | 97% provider / 3% SBP. No fund contribution. |
| 11b | Revenue split — OGIP government | Configurable per adopting nation. Default 75/20/5 (provider/fund/SBP) for Samoa OGIP. |
| 12 | OGIP integration | Parallel build from Phase 0 |
| 13 | Domestic pricing | Configurable per OGIP nation. Internal WST rate (ministry-to-ministry). Domestic private sector rate (provider configured). International full rate. Partner negotiated rate via smart contract allowance. |
| 14 | Commission (Tier 5) | Deferred to Phase 2 pending CBS written position. Manual invoice + delivery during POC. |
| 15 | Skills files | Both Agent.market and PDP formats generated per endpoint automatically |
| 16 | Tier 1–2 fee mechanics | 100% direct to provider wallet. SBP 3% invoiced monthly as single USDC transfer when earnings ≥ $10 threshold. Rolls over below threshold. |
| 17 | Tier 5 escrow | Deferred Phase 2 — custody risk. Manual during POC. |
| 18 | Dispute resolution | Provider-buyer direct. SBP not involved. Clearly stated in ToS and at point of purchase. |
| 19 | Jurisdiction field | OGIP layer only. Not in PDC international tables. |
| 20 | National fund | OGIP/Samoa only. No fund contribution in PDC international layer. |
| 21 | USDC off-ramp | Provider responsibility. CBS consultation ongoing. Clearly disclosed at onboarding. No implied promise of easy fiat conversion anywhere in UI. |
| 22 | Certificate version | v1.1 at launch — includes dataset content hash. Publish-once format. |
| 23 | Bronze price cap | Tier 1–2 only (max $0.50/query) unless provider has verified_government flag. OGIP government track bypasses cap. |
| 24 | OGIP credits | Non-monetary contribution score during POC. WST settlement Phase 2 pending MoF agreement. |
| 25 | Auto-confirm window | 7 days + explicit dispute state. Block-height based, not wall clock. |
| 26 | PDC Council | Deferred indefinitely. Not needed in current model. |
| 27 | Pipeline service | Optional, paid. First dataset free permanently. $25 per dataset thereafter. +$10 surcharge for scanned PDFs. Charged only after provider approves output, not at upload. |
| 28 | Silver rating system | 3 upvotes from 3 different verified purchaser wallets (on-chain proof of paid query required). Alerts sent to eligible purchasers after their query. Threshold configurable — 3 for POC, rising to 10 at scale. |
| 29 | Facilitator fee | Buyer pays facilitator fee on top of query price. Standard x402 behaviour. SBP does not touch it. |
| 30 | Dispute flag threshold | 3 flags from 3 different verified buyer wallets triggers automatic directory pause. 1 flag per wallet per endpoint per 30 days. Provider notified immediately. SBP does not arbitrate. |
| 31 | SBP fee collection threshold | Collect only when Tier 1–2 earnings ≥ $10 USDC. Roll over below threshold. 7-day notice before collection. Provider initiates settlement via one-click dashboard function (provider wallet signs the transaction — SBP never holds pull authority over provider wallets, which would violate P2). 21 days unpaid → directory pause (endpoint keeps running — SBP has no right to shut it down). |

---

## 6. Technology Stack — Confirmed

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS | Provider dashboard, onboarding UI, buyer search, admin panel |
| i18n | next-intl | English at launch, Pacific language stubs built in |
| Directory API | Hono (TypeScript), Railway | x402-gated search and discovery |
| x402 packages | @x402/hono, @x402/avm, @x402/core — pinned versions behind internal pdc-x402-adapter module | Never call x402 packages directly — always via adapter |
| Database | Supabase (PostgreSQL) | All application state, RLS on every table |
| File storage | Cloudflare R2 | Raw uploads (temporary — deleted after pipeline + approval) |
| AI Pipeline | Python (FastAPI + Celery + Redis), Railway | Optional formatting service — not in critical path |
| LLM | Claude Sonnet 4.6 via Anthropic API | Pipeline formatting stages |
| Blockchain | Algorand Mainnet | USDC settlement, NFT provenance certs |
| Algorand nodes | Nodely paid tier (primary, $49/month) + AlgoNode free tier (automatic failover) | Never single node in production |
| Smart contracts | PyTeal / ARC-4 | OGIP revenue split (government track only), fund multi-sig |
| Payment protocol | x402 via GoPlausible facilitator | Per-query micropayments |
| Facilitator failover | Platform status page + graceful degradation messaging | GoPlausible is a SPOF — handle it gracefully |
| Traditional payments | Stripe MPP | Phase 2 — fiat/card for institutional buyers |
| ISO 20022 bridge | Custom oracle | Phase 2 — bank payment triggers |
| Email | Resend | Transactional: onboarding, cert renewal, rating alerts, fee notices, dispute flags |
| Monitoring | Vercel Analytics + custom Supabase queries + endpoint health checker (Railway cron, every 5 min) | Platform health and business metrics |
| CDN / DNS | Cloudflare | Global edge, DDoS, SSL |

---

## 7. Revenue Model — Confirmed

SBP earns from five streams. No hosting fee. No subscription fee. Zero cost to list.

| Stream | Rate | Mechanism | Notes |
|---|---|---|---|
| Transaction fee | 3% | Tier 3–5: in-flow split. Tier 1–2: monthly USDC invoice above $10 threshold | Primary revenue stream at scale |
| Directory query fee | $0.01/search | x402 automated | Leaderboard transaction volume |
| Pipeline service | $25/dataset ($0 first dataset) | Charged after provider approves output | +$10 scanned PDF surcharge |
| Trust tier upgrade | $25 Silver / $100 Gold | One-time, annual renewal 50% | Compensation for clerical review time |
| White-label licensing | $20K–100K/year | Phase 2+ | SIDS replication revenue |

---

## 8. Trust Tier System — Confirmed

SBP verifies identity and records community signals. SBP never assesses data quality.

**Bronze — Identity Verified (Free, Same Day)**
SBP checks: institutional email domain (DNS), institution in official registry, Algorand wallet valid and USDC opted in, contact person verified against institutional website, basic metadata present.
Price cap: Tier 1–2 only (max $0.50/query) unless verified_government flag.
Buyer display: "Identity Verified — Unrated"
SBP liability: Identity verification only.

**Silver — Community Verified (Free to achieve)**
Trigger: 3 upvotes from 3 different verified purchaser wallets (on-chain payment proof required).
Primary rating channel: Wallet-signed API call — agent or buyer submits a signed rating with their Algorand wallet and the transaction ID proving they paid for a query. This is the primary channel because the majority of buyers are AI agents with wallets, not email inboxes.
Secondary rating channel: Email prompt sent to human buyers who provide an email address at query time. Optional opt-in only.
Skills file for each endpoint includes the rating API endpoint so agents can submit ratings programmatically.
SBP role: Records community ratings. Does not assess quality.
Buyer display: "Community Verified — [X] buyers"
Price cap: None.

**Gold — Peer Reviewed ($25 one-time)**
Provider submits: DOI or equivalent peer review evidence.
SBP checks (clerical only, 15 minutes): DOI resolves via CrossRef, author name matches provider record, paper references the dataset.
SBP does NOT assess: methodology soundness, scientific validity, data quality.
Provider also submits: COI declaration (published in full alongside certificate — SBP does not assess it, community reads it).
Buyer display: "Peer Reviewed — [Journal/Body Name]"
Annual recertification: $12.50 (50% of upgrade fee).

**What SBP never does at any tier:**
- Assess scientific quality
- Replicate peer review
- Make judgments about methodology
- Express opinions on research conclusions

---

## 9. Dispute Resolution — Confirmed

Disputes are between provider and buyer. SBP is not involved.

**At point of purchase (Bronze endpoints):**
One-click acknowledgment: "This provider is identity-verified but not community-rated. You are transacting directly with [Institution Name]. All disputes are between you and the provider. SBP is the directory and payment infrastructure only."

**Dispute flag mechanism:**
Any verified buyer can flag a dispute. 3 flags from 3 different verified buyer wallets → automatic directory pause. Endpoint keeps running (SBP has no right to shut it down). Provider notified immediately by email. Provider resolves with buyers directly. Buyers remove flags when resolved. SBP does not arbitrate.

**ToS requirement:**
Providers must publish their own dispute resolution contact and process. SBP's ToS makes clear SBP is not a party to any provider-buyer dispute.

---

## 10. Certificate Design — v1.1 Required at Launch

Certificate format is publish-once (Principle P6). Must be correct at launch.

**v1.1 additions over v1.0:**
- `dataset_content_hash`: SHA-256 of the actual dataset at time of certification
- `/integrity` route on every provider endpoint: returns current dataset hash for buyer verification
- `creator_verification`: ORCID or institutional registry link for lead researcher
- Revocation-by-clawback: documented process, not silent

**Canonical serialisation rule for dataset hashing (mandatory — without this the /integrity check produces false positives):**
- JSON datasets: `JSON.stringify` with keys sorted alphabetically, no whitespace, UTF-8 encoding
- CSV datasets: UTF-8 encoding, LF line endings (Unix), header row included, no trailing newline
- Binary datasets: SHA-256 of raw bytes, no transformation
- The hash is computed on the canonical form at certification time and recomputed identically on every `/integrity` call
- This rule must be in the Pacific Data Protocol specification and in the provider endpoint template before any pilot provider goes live

**On-chain:** Certificate hash + dataset content hash in Algorand ASA note field.
**Off-chain:** Full certificate JSON in Supabase, publicly readable via verify endpoint.

---

## 11. Legal Framework — Required Before Mainnet

The following must exist before any provider goes live on Mainnet:

**Provider ToS must include:**
- SBP role: directory and payment infrastructure only
- Provider responsibility: data accuracy, IP rights, export compliance, dispute resolution
- Copyright warranty: provider holds rights to all listed data
- Indemnification: provider indemnifies SBP for false declarations or IP violations
- Data Processing Agreement: covers optional pipeline service only
- Governing law: Samoa. Arbitration: Apia (domestic), SIAC above $50K (international)
- USDC off-ramp disclosure: provider is responsible for their own fiat conversion

**Buyer ToS must include:**
- SBP role: directory and payment infrastructure only
- No quality warranty from SBP
- Dispute resolution: directly with provider
- Permitted use cases: as specified in endpoint sovereignty flags
- Attribution requirements: as specified per endpoint

**Certificate Revocation Policy (published document):**
- Exhaustive list of revocation grounds (6 grounds — fraud, hash mismatch, institution dissolved, criminal conviction, failed recertification, violated community consent)
- Not grounds for revocation: commercial pressure, political pressure, disagreement with findings
- Process: 30-day investigation, 14-day appeal, independent panel
- Emergency: temporary suspension (not revocation) for active fraud
- Buyer notification: all buyers who queried in last 90 days notified on revocation

**SBP liability cap:** Fees paid by provider in preceding 12 months. Safe harbour: verification service, not quality guarantee.

**Legal clock starts now (long-pole items):**
- CBS consultation on x402 payment architecture — regulatory position required before Mainnet
- ToS drafting (qualified Pacific legal review) — required before any provider goes live

---

## 12. Reference Documents

| Document | Contents | Superseded by CLAUDE.md? |
|---|---|---|
| Part 1: pacific-data-commons-build-plan.md | Component map, build sequence, environment variables | Where conflicts exist, yes |
| Part 2: pacific-data-commons-research-context.md | Market validation, directory fields, 17 categories | No conflicts |
| Part 3: pacific-data-commons-architecture.md | Database schema, API routes, pipeline prompts | Revenue split, jurisdiction, tier model superseded |
| Part 4: pacific-data-commons-part4-architecture-intelligence.md | Fable 5 findings, user journeys, UI/UX spec, security | Core findings confirmed and incorporated here |
| Part 5: pacific-data-commons-part5-risk-validation.md | Fable 5 risk validation, business model assessment, pre-build clearance | All findings incorporated in CLAUDE.md v2.1 |

**Specific Part 3 supersessions (errata):**
- §2.2, §6.1, §6.2: Revenue split — superseded by Decisions 11, 16 (3% not 10%, no fund for international)
- §3.2 providers table: `sbp_fee_pct DEFAULT 3` (confirmed 97/3 split — not 5, not 10), `provider_pct DEFAULT 97` (not 70), remove `national_fund_pct` from PDC tables
- §3.3 directory routes: price `$0.01` (not `$0.001`)
- §3.2 all tables: remove `jurisdiction` field from PDC tables (endpoints, providers, transactions_log) — jurisdiction in OGIP tables only

---

## 13. Skills Files — Load Before Relevant Sessions

| Skill | Load When |
|---|---|
| `algorand-smart-contract` | Any Algorand, ASA, smart contract, or wallet session |
| `x402-payment-protocol` | Any payment flow, endpoint, or facilitator session |
| `ai-formatting-pipeline` | Any Claude API pipeline or document processing session |
| `provenance-trust-layer` | Any certificate, trust tier, or verification session |
| `pacific-data-protocol` | Any schema, skills file, or category session |
| `smart-contract-auditor` | Before deploying any smart contract to Mainnet — mandatory |
| `iso20022-oracle-bridge` | Phase 2 — any fiat payment or institutional banking session |
| `ogip-architecture` | Any ministry onboarding, credit ledger, or OGIP session |
| `i18n-pacific` | Any frontend text, locale, or language session |
| `stripe-mpp-integration` | Phase 2 — any Stripe session |
| `project-manager-pdc` | Start of every new build phase |
| `national-sovereignty-fund` | Any OGIP fund governance or multi-sig session |
| `database-developer` | Any Supabase schema, migration, or RLS session |
| `frontend-developer` | Any Next.js component or UI session |
| `sbp-security` | Every session — always loaded |
| `adversarial-simulation` | Before any production deployment |

---

## 14. Competition Context

**x402 Global Challenge on Algorand**
- Prize: $100K USD + 500K ALGO
- Entry type: Composite
- Registration: algorand.co/global-x402-challenge — register immediately
- Submission deadline: September 2026
- Leaderboard: Real Mainnet transaction volume, unannounced October window
- Finalists: Top 10 present live at Devcon 8, India

**Competition requirements:**
- All endpoints tagged `x402-global-challenge` in extra field
- SBP directory endpoint registered in GoPlausible Bazaar
- At least one pilot provider endpoint live on Mainnet
- Agent discovery file live at `/.well-known/x402-directory.json`
- Real USDC flowing through GoPlausible facilitator

The competition is a forcing function and a potential funding event ($100K covers ~3 years of operational costs and funds Phase 2). It is not the primary goal. The primary goal is production-grade Pacific sovereign data infrastructure.

---

## 15. USDC Off-Ramp Reality

No regulated USDC-to-fiat exchange exists in Samoa or most Pacific nations. This is a known gap, not a platform failure.

**What this means for every session:**
- Never write UI copy that implies easy USDC-to-fiat conversion
- Never promise providers they can easily access their earnings in local currency
- Always refer to USDC as "USD-pegged digital currency" not "digital cash"

**What providers are told at onboarding (honest, not discouraging):**
USDC is a USD-pegged digital asset held in your Algorand wallet. Options for accessing value: hold as digital treasury, peer-to-peer exchange locally, future CBS pathway (under consultation), or overseas exchange via international bank account. SBP is actively consulting with CBS on the regulatory pathway. We will update you as options become available.

**CBS consultation status:** Ongoing. Written position required before Mainnet launch. This is the long-pole regulatory item.

---

## 16. Key External References

| Resource | URL |
|---|---|
| x402 Developer Guide | https://dev.algorand.co/resources/x402-on-algorand/ |
| GoPlausible Facilitator | https://facilitator.goplausible.xyz/dashboard/ |
| Challenge Registration | https://algorand.co/global-x402-challenge |
| Challenge Blog | https://algorand.co/blog/the-x402-global-challenge-is-live-how-to-build-submit-your-entry |
| WAD-26 Demo | https://github.com/algorandfoundation/WAD-26-x402-demo |
| Flight Search Demo | https://github.com/algorandfoundation/x402-flight-search-demo |
| Main x402 Demo | https://github.com/algorandfoundation/x402-demo |
| Nodely API | https://nodely.io/docs/free/start |
| AlgoKit Docs | https://developer.algorand.org/algokit/ |

---

## 17. What Good Output Looks Like

In every session, good output means:

- **Production-ready code** — typed, error-handled, logged, validated
- **No placeholders** — if a function is listed, it is implemented
- **Security by default** — RLS, input validation, rate limiting included without being asked
- **x402 adapter pattern** — never call @x402 packages directly, always via pdc-x402-adapter
- **No jurisdiction field in PDC tables** — jurisdiction exists in OGIP layer only
- **97/3 split for PDC international** — not 70/20/10, not 75/20/5
- **Documented** — JSDoc for functions, inline comments for complex logic
- **Tested** — smoke test for every new endpoint or function
- **Pacific connectivity aware** — resumable uploads, form state persistence, offline states

---

## 18. What to Flag Immediately

Stop and flag before proceeding if you encounter:

- Any design requiring SBP to hold client funds (including via smart contract)
- Any data flow where provider data transits SBP infrastructure
- Any smart contract pattern without formal audit checklist completed
- Any cultural data handling without sovereignty flag and community consent verification
- Any breaking change to a published API route or PDP schema
- Any jurisdiction field being added to PDC international tables
- Any hardcoded secret, API key, or wallet address in code
- Any feature that may require a financial services licence from CBS
- Any irreversible on-chain action without explicit user confirmation
- Any pipeline LLM output used directly as executable code or instructions
- Any UI copy implying easy USDC-to-fiat conversion
- Any quality assessment or dispute arbitration role being assigned to SBP
- Any x402 package being called directly rather than through pdc-x402-adapter

---

## 19. Design-Partner Programme — Critical Path

The design-partner programme is critical path, not nice-to-have. It serves two functions simultaneously that cannot be separated:

**Function 1 — Leaderboard volume engine.** The x402 Global Challenge leaderboard measures real Mainnet transaction volume in October 2026. Without active agent developers querying PDC endpoints, leaderboard volume will be minimal regardless of how many providers are listed. Design partners generate this volume.

**Function 2 — Silver bootstrap.** Pilot providers need 3 verified purchaser upvotes to reach Silver tier before the competition measurement window. Design partners are the most likely source of the first real paid queries and therefore the first upvotes.

**What design partners receive:** Early API access, direct SBP technical support, co-marketing as founding integration partners in the developer documentation.

**What SBP needs from them:** Active queries during the competition window, feedback on Pacific Data Protocol schemas, ratings submitted after queries.

**Target:** 5-10 agent developer teams building Pacific-relevant tools (climate models, fisheries analytics, trade intelligence, agricultural commodity platforms).

**Timeline:** Outreach begins at Phase 1 completion (first Mainnet endpoint live). First confirmed design partner before Phase 2.

---

## 20. OGIP Scope — Minimal Phase 0 in Parallel

Full parallel OGIP build (including fund contract, production ministry onboarding, CBS consultation, MoF agreement) threatens the September competition deadline because these items have long-lead dependencies outside SBP's control.

**Confirmed minimal OGIP Phase 0 (runs in parallel with PDC build):**
- OGIP database schema tables added to Session 1 migration alongside PDC tables
- Non-monetary contribution credit ledger designed and documented (no smart contract during POC)
- One sandbox ministry data endpoint with synthetic data (proves internal routing logic)
- OGIP architecture documented so Phase 2 production build can begin immediately when dependencies are met

**Explicitly deferred to Phase 2:**
- Algorand smart contract for OGIP revenue split (requires CBS written position)
- Production ministry onboarding (requires ToS and MoF agreement)
- WST settlement mechanism (requires MoF agreement)
- National fund governance contract (requires CBS and Finance ministry sign-off)

This satisfies Decision 12 (OGIP parallel build from Phase 0) while protecting the competition timeline.

---

## 21. Legal Framework — Pathway Without Upfront Cost

Qualified Pacific legal review is required before any external provider goes live on Mainnet. Given pre-revenue startup constraints, SBP pursues legal support through four parallel tracks at zero upfront cost.

**Track 1 — ISOC Research Paper Co-authorship (Primary)**
The PDC raises novel legal questions of regional significance — what framework governs cross-border micropayment data transactions in Pacific SIDS, how UNDRIP interacts with commercial data licensing, what regulatory gap exists between traditional payment law and x402 protocol transactions. These are publishable research questions.

Engage NUS Law Faculty or USP Law Faculty as ISOC paper co-authors. Research output is dual-use: published ISOC paper section on Pacific digital commerce legal frameworks, and the PDC legal framework document that underpins the Provider ToS, Buyer ToS, and OGIP Ministry Agreement. The co-author produces the analysis — the ToS drafting flows from it. NUS specifically is positioned to welcome edge-case legal review of novel Pacific digital commerce scenarios.

**Track 2 — Minimum Viable Pilot Disclaimer (Immediate, Zero Cost)**
SBP drafts and displays on the platform from day one:

Provider-facing: "Pacific Data Commons is operating as a pre-commercial pilot. Terms of service are under development. By registering you acknowledge: SBP is a directory and payment infrastructure operator only — not a quality assessor, financial intermediary, or dispute arbitrator. You retain all rights to your data. Disputes are between you and buyers directly. This pilot operates under Samoa law."

Buyer-facing: "Pacific Data Commons is a pre-commercial pilot. SBP does not warrant data quality, accuracy, or fitness for purpose. All disputes are between you and the data provider directly. SBP's role is directory infrastructure and payment routing only."

This is not a substitute for proper ToS. It provides interim protection during the build and competition period.

**Track 3 — Development Finance Technical Assistance (Parallel)**
Apply to World Bank Digital Economy for Pacific (DE4P) and ADB Pacific Private Sector Development Initiative (PSDI) for legal technical assistance grants. These programmes fund exactly this type of support for Pacific digital infrastructure startups. Applications should reference the PDC planning documents as the brief. Timeline: 4-8 weeks for approval.

**Track 4 — Pacific Law Firm Structured Barter (Backup)**
Approach 2-3 Pacific commercial law firms (Samoa and Fiji) with a structured arrangement: PDC Gold tier listing as a legal services provider, first right of refusal on future paid legal work, public credit as platform legal partner — in exchange for initial ToS drafting at deferred rates triggered by competition prize receipt or first revenue. The $100K competition prize is a credible payment trigger.

**Track 5 — Open Source Template Adaptation (Immediate Fallback)**
Adapt Ocean Protocol and Stripe API ToS as a working draft template. Provides any lawyer or academic co-author with a starting point, reduces their work significantly, and serves as the reference document for the pilot disclaimer.

**Legal timeline requirements:**
- Minimum viable disclaimer: live from Phase 0
- Reviewed Provider ToS: required before Phase 8 (pilot provider onboarding)
- Reviewed Buyer ToS: required before Phase 8
- OGIP Ministry Agreement: required before any government ministry goes live (Phase 2)
- CBS consultation: initiated now, written position required before Mainnet launch

---

*This is CLAUDE.md v2.1. It is the authoritative document for every Pacific Data Commons session. If anything in this session conflicts with this document, this document wins. Flag the conflict and resolve it before proceeding. Where Parts 1–5 conflict with this document, this document supersedes them. The errata notes in Section 12 identify specific Part 3 sections that are superseded.*
