# CLAUDE.md — Pacific Data Commons
## Master Project Brief and LLM Session Orientation

**Organisation:** Synergy Blockchain Pacific (SBP)
**Project:** Pacific Data Commons (PDC) + OGIP Integration
**Version:** 2.2 — Post Fable 5 Extended Architecture (Parts 4 + 5 + 6)
**Classification:** Internal — All Sessions
**Authority:** This document supersedes all planning documents (Parts 1–6) wherever they conflict. CLAUDE.md wins. Flag conflicts, resolve before proceeding.

---

## 1. What SBP Is Building — The Simplest True Statement

SBP is building **a library, a payment rail, and sovereign rights infrastructure for the Pacific.**

- The library: a searchable, x402-gated directory of Pacific data endpoints
- The payment rail: x402 protocol routing USDC directly from buyers to providers
- The agent marketplace: pre-built and third-party AI agents that query PDC data on behalf of Pacific users
- The sovereign rights layer: community-controlled on-chain records of EEZ management, customary land stewardship, and resource governance decisions
- SBP never touches the data
- SBP never holds funds
- SBP never arbitrates disputes
- SBP verifies identity, not quality
- SBP has no administrative role over sovereign rights records — communities control them absolutely

Everything else — the AI formatting service, the trust tier system, the OGIP, the provenance certificates — serves these core functions or is a value-added service built on top of them.

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

**P11 — SBP Has No Administrative Role Over Sovereign Rights Records**
For sovereign rights infrastructure (EEZ records, customary land and sea stewardship records), SBP has no clawback authority, no freeze capability, no admin path, and no ability to alter, delete, or access community records. This is expressed in the RLS policies — there is no sbp-admin write policy on sovereign records tables. SBP cannot rescue a community from key loss; the recovery posture (including "no recovery") is the community's pre-configured choice. This is not a limitation — it is the design. Communities that have been harmed by external administrative control require infrastructure where that control genuinely does not exist.

**P12 — Upload Security**
Every file upload to the PDC platform is treated as untrusted input. Files are processed through a five-layer security pipeline (Decision 58) before any Claude API call. Prompt injection via file upload is a live attack vector. No LLM output from the upload pipeline becomes live endpoint content without explicit human provider approval. The $25 upload fee is both resource cost recovery and an accountability mechanism that traces malicious submissions to on-chain wallet identities.

**P2 Extension — No Prepaid Agent Credits**
SBP must never build prepaid credit balances for agent usage. Prepaid credits are stored value requiring a CBS stored value licence. Agent usage is pay-per-run only. Users fund their own Algorand wallets with USDC — that is their own asset management, not SBP custody.

---

## 5. Confirmed Pre-Build Decision Register

All 62 decisions are final. Do not revisit unless explicitly instructed.

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
| 32 | Agent marketplace commission model | 100% of user x402 payment settles to developer wallet. SBP's 12% commission invoiced monthly above $10 USDC threshold via provider-signed one-click settlement. Same pattern as Decision 31. No automatic split contract for agent commissions — reintroduces payment-intermediary characterisation. |
| 33 | Agricultural agent Pacific language output | English at launch. Pacific language output (Samoan, Fijian, Tongan) uses human-reviewed template + glossary system, not raw LLM translation. Unreviewed machine translation of agricultural guidance to smallholders is a harm vector. Phased rollout: Samoan Phase 2, Fijian/Tongan Phase 3. |
| 34 | Agent caching and endpoint reuse | Provider-configured caching policy per endpoint: per_run (agent queries fresh every run), ttl_cache (agent may cache for provider-configured TTL, default 24h for static data), unrestricted (agent may cache indefinitely for genuinely static datasets). Stored in endpoints.agent_reuse_policy. |
| 35 | White-label licensing revenue | Flat annual licence fees ($20K–$100K per jurisdiction). No per-transaction commission on white-label licensee volume — unenforceable across borders and imports intermediary characterisation. Optional audited annual revenue-share for licensees exceeding $1M annual volume, contractual not automatic. |
| 36 | Sovereign records: no SBP admin role | SBP has no clawback, freeze, or administrative path on sovereign rights records. No sbp-admin write RLS policy on sovereign records tables. Community controls their records absolutely. SBP cannot rescue a community from key loss. Recovery posture is community's pre-configured choice. See P11. |
| 37 | Agent attribution records | Every marketplace agent (first- and third-party) must submit a wallet-signed attribution record per run to POST /agent/attribution: {run_id, endpoint_tx_ids[], originating_user_wallet_hash, agent_id}. Stored in agent_run_endpoints. Compliance monitor reconciles nightly against on-chain payments. Unattributed payments above tolerance → compliance strike → delisting path. Required for Silver rating eligibility, self-dealing detection, and honest leaderboard volume. Build before any agent is built. |
| 38 | No prepaid agent credits | SBP must never build prepaid credit balances for agent usage. Stored value requires CBS licence. Pay-per-run only. See P2 Extension. |
| 39 | Cultural sovereignty price floor | Provider-set minimum price for cultural data endpoints, technically enforced at endpoint level. No SBP override capability. Schema field cultural_sovereignty_price_floor reserved in endpoints table. Phase 2 enforcement. |
| 40 | Transaction log visibility | Buyer activity visible only to transacting provider (their earnings only) and SBP compliance function. Never visible to other buyers at any granularity. Architecturally enforced. |
| 41 | verified_commercial flag | Parallel to verified_government. LLM-assisted identity verification, human confirmed before flag is set. Bypasses Bronze price cap. Defined verification checklist required before implementation. |
| 42 | Research endpoint category | Maximum Tier 1 pricing ($0.01) for governance and policy research endpoints. Underlying document openly accessible. PDC hosts structured queryable endpoint only. Never a paywall on underlying document. |
| 43 | Provider internal governance liability | ToS clause: provider solely responsible for internal data governance, staff access controls, and confidentiality. SBP not liable for insider extraction events. |
| 44 | 24-month referral fee obligation | Providers who take PDC-discovered buyer relationships off-platform within 24 months of first query owe 3% commission on off-platform volume. Enforceable via provider ToS. |
| 45 | Data auction mechanism (Phase 3) | Time-limited USDC auction for unique one-time datasets. 3% SBP commission on winning bid. Architecture must not preclude. No implementation timeline set. |
| 46 | ZK-proof buyer anonymity (Phase 3) | Research item only. Zero-knowledge proof of payment for buyer query privacy. Contingent on CBS regulatory position and platform volume. |
| 47 | Pacific e-commerce platform (future) | Sister application on x402 payment rail. Strategic direction. Current architecture must remain compatible. Not in current build scope. |
| 48 | Data partitioning convention | Providers encouraged to structure datasets as partitioned queryable subsets at different price tiers. Pipeline service to support. Developer documentation to explain. |
| 49 | Automatic integrity checks | Every agent endpoint query runs checkEndpointIntegrity() before payment. status === 'fail' (hash mismatch) blocks payment. 'no_cert_hash' and 'endpoint_unavailable' do not block. Implemented Session 17. |
| 50 | Integrity flag threshold | 3 consecutive fail events from any trigger source flags the endpoint in directory. Flag not automatically cleared on pass — provider requests clearance via dashboard. Prevents gaming by cycling data back. |
| 51 | Cultural sovereignty price floor schema | cultural_sovereignty_price_floor field reserved in endpoints table from Session 17. Enforcement logic is Phase 2. Field must exist in schema from Session 17 forward. |
| 52 | Versioned snapshot anchoring (Phase 2) | Periodic hash-and-anchor cron for full dataset version history on-chain. Compatible with any storage architecture. Do not build now, do not design out. |
| 53 | Sovereign distributed node architecture (Phase 3 only) | Each nation or community runs their own node on their own infrastructure within their own jurisdiction. Data never leaves provider jurisdiction. On-chain record is cryptographic commitment only, not a copy. Coordinated via regional collaboration (DAO-like governance, analogous to Estonia X-Road but Pacific-sovereign). SBP operates routing and trust layer only. Third-party content-addressed storage (IPFS, Algorand ASA metadata) explicitly rejected as a sovereignty solution — data that cannot be retracted from a third-party system is not sovereign data. |
| 54 | Declared dataset update flow | Providers must declare updates before changing dataset. Four categories: additive, correction, expansion, methodology_change. pending_recertification state bypasses integrity block during 7-day update window. Implemented Session 18. |
| 55 | Agent ecosystem notifications on update | All agent wallets that queried an endpoint in the last 90 days receive structured update notification on every certified version. Human buyers with email addresses receive email notification. |
| 56 | PDC as central interoperability layer | PDC is the central interoperability and routing layer for the Pacific regional distributed node network. Every sovereign node deployed by SBP connects to PDC as the discovery and payment routing layer. Node deployment is a billable service. The OGIP government stack and PDC commercial layer share the same node infrastructure — a ministry node is simultaneously a PDC provider endpoint and an OGIP interoperability node. |
| 57 | External x402 sources | PDC agents may query approved external x402-compatible endpoints as supplementary data sources. Pacific PDC data is always primary. External sources always supplementary, clearly labelled, controlled via approved_external_sources table. SBP approves all external sources. Agents never query unapproved external sources. |
| 58 | Upload security architecture | All file uploads pass through five-layer security pipeline before Claude processing: (1) file type whitelist validation, (2) content sanitisation stripping metadata and executables, (3) Claude prompt construction treating content as data only with explicit injection rejection instructions, (4) output schema validation rejecting non-conforming Claude output, (5) mandatory human review gate before any formatted content is stored or deployed. No free upload tier for cold inbound submissions — $25 USDC minimum per dataset is both resource cost recovery and accountability mechanism. First-dataset-free policy does not apply to cold inbound external provider uploads — only to SBP's own pipeline service for verified providers. |
| 59 | First-party open-data utility endpoints | PDC may directly host, fetch, cache, and sell first-party utility wrapper endpoints around freely-open external data sources (precedent: `/finance/fx`, `/pacific/weather`, `/pacific/events`, `/finance/samoa-cpi`). P1 ("data never leaves provider infrastructure") and P10 ("SBP is not a data processor") do not apply to this class of endpoint — there is no third-party provider whose data PDC is processing on their behalf; PDC is the first-party publisher of its own aggregation of an already-public source. Every such endpoint's response must name its true upstream source and, where the upstream itself attributes to a further original source (e.g. World Bank attributing to a national statistics office), state that attribution and make clear PDC/SBP has not independently certified it. |
| 60 | First-party open-data endpoint pricing | Endpoints under Decision 59 are capped at Tier 1 ($0.01/query) and require a genuinely open (no-auth, free) external source — same reasoning Decision 42 uses for research/governance endpoints (open underlying source caps the price low), but its own decision rather than an indefinite stretch of 42's literal scope (governance/policy research papers) to every open-data wrapper added going forward. |
| 61 | PDC as Pacific Data Registry | PDC's primary long-term revenue model: curated agent-ready reformatting of public domain Pacific datasets (SPC, WCPFC, NOAA, Pacific Data Hub) gated via x402. PDC sells the reformatted/validated layer, not raw data. All endpoints must include data_currency, reporting_lag_note (where applicable), attribution, and temporal bounds in every response. First-mover position in Pacific agent-ready data. |
| 62 | Registry Operations Team | Dedicated Pacific-based team to discover, ingest, validate, and maintain PDC registry endpoints using SBP Agent OS pipelines within data integrity parameters (Decision 61) and upload security pipeline (Decision 58). Funded by registry transaction revenue. Provides Pacific employment in the agentic economy. |

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

**Node Deployment Service — Confirmed Commercial Model (August 2026)**

| Phase | Service | Price | Notes |
|---|---|---|---|
| Launch | Template download + self-deploy | Free | Institution does all work, SBP registers endpoint |
| Launch | File upload, Claude-assisted formatting | $25 USDC per dataset | Paid on platform. No free tier for cold inbound uploads. |
| Launch | Scanned PDF surcharge | +$10 USDC | Added to above |
| Launch | Full SBP deployment | $150 USD invoiced | SBP structures + deploys + tests + registers |
| Launch | Complex deployment (cultural data, multiple datasets) | $300 USD invoiced | Includes sovereignty flag setup |
| Launch | Bank transfer surcharge | +$50 USD | Added to invoiced services if paying by bank |
| Post-launch | Deployment fee | $200–$500 USD | Based on transaction intelligence from launch period |
| All tiers | Transaction commission | 3% permanently | SBP earns when provider earns. No subscription. No hosting fee. |

Stripe integration for online card payment of deployment services: Phase 2 (does not require CBS consultation — standard e-commerce, not payment intermediary function).

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
| Part 6: pacific-data-commons-part6-extended-architecture.md | Fable 5 extended design — agent marketplace, bidirectional wallet, sovereign rights infrastructure, global expansion | All findings incorporated in CLAUDE.md v2.2 |

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
| `adversarial-simulation` | Before any agent marketplace or sovereign rights session — agent subversion vectors are live threats |
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
- Any agent built before the attribution API (POST /agent/attribution) and agent_run_endpoints table exist
- Any prepaid credit or stored value mechanism for agent usage (Decision 38, P2 Extension)
- Any automatic split contract for agent developer commissions (Decision 32)
- Any SBP administrative capability added to sovereign rights records (P11)
- Any Pacific language agricultural guidance output generated by raw LLM without human-reviewed templates (Decision 33)
- Any sovereign rights code built before G5 (qualified legal review) and G6 (named pilot community) are resolved
- Any platform copy that characterises a live sovereignty dispute rather than stating verifiable facts neutrally

---

## 19. Agent Marketplace — Architecture Summary

The PDC includes an integrated AI Agent Marketplace as a feature of the web application. Pre-built SBP agents and third-party developer agents query PDC endpoints on behalf of Pacific users.

**Six first-party agents (Phase 2 build):**
- Pacific Trade Intelligence (Trade + Demographics endpoints)
- Pacific Climate Risk (Climate + Ocean + Disaster Risk endpoints)
- Pacific Fisheries Status (Fisheries + Ocean — must combine both, ocean temperature context is required for scientifically valid fisheries interpretation)
- Pacific Agricultural Exports (Agriculture + Trade + Climate — primary users are smallholder farmers, output must be plain language, Pacific language rollout per Decision 33)
- Pacific Remittance Navigator (Remittance + Financial Flows endpoints)
- Pacific Grant Matcher (multiple endpoints + external grant databases)

**Agent payment model (Model F — agent-fronted):**
The agent's operational wallet pays PDC endpoints. The user pays the agent one all-in price. Attribution records (Decision 37) carry originating user identity to preserve Silver rating eligibility and self-dealing detection.

**Third-party developers:**
Register as Agent Developers. Commission is 12% invoiced monthly (Decision 32). Agents must submit attribution records (Decision 37). Sovereignty flag enforcement is mandatory — agents that ignore indigenous_data_flag or cultural_sensitivity flags are de-listable.

**Bidirectional wallet — circular economy:**
A provider's earnings wallet can also fund agent queries. A ministry earns USDC from data sales and uses that same wallet to query agents. This creates a self-sustaining Pacific data economy. Ministerial wallets have RBAC controls — spending limits by role, approval chains for large transactions, hot wallet topology as the enforcement mechanism (balance IS the limit, not a rule SBP enforces).

**What is explicitly rejected and why (do not resurrect):**
- Automatic 88/12 split contract for agent commissions — reintroduces payment-intermediary characterisation (Decision 32)
- Prepaid agent credit balances — stored value requiring CBS licence (Decision 38, P2 Extension)
- Per-transaction commission on white-label licensee volume — unenforceable cross-border (Decision 35)

---

## 22. Sovereign Rights Infrastructure — Architecture Summary

The PDC provides blockchain infrastructure for Pacific communities to document and protect their sovereign rights over land, sea, and resources. This is a Phase 2+ build gate behind G5 (legal framework) and G6 (named pilot community).

**What this infrastructure does:**
- Provides infrastructure for communities to record their governance decisions in immutable, timestamped, community-controlled format
- Creates a verifiable evidence layer of continuous stewardship beyond legislative amendment
- Gives communities absolute control over who accesses their records
- Timestamps every configuration change — the history of community decisions is itself immutable

**What this infrastructure does NOT do (mandatory copy in all UI and documents):**
- Does not establish, prove, or substitute for legal title to land or sea
- Does not provide legal advice or legal opinions
- Does not guarantee any outcome in any legal proceeding
- Does not represent SBP as an arbiter of customary rights
- Does not impose any external framework on community governance

**Jurisdiction types:**
The OGIP jurisdictions table includes a fourth type: `territory` — for non-self-governing territories (Tokelau), freely associated states (Cook Islands, Niue), and overseas collectivities (French Polynesia, New Caledonia). Each has a different sovereignty profile. The platform stores the UN's own characterisations as initial values and a `self_description` field for community-provided characterisation. Platform copy never characterises live sovereignty disputes — factual neutrality is a binding standard.

**Community-governed mutability:**
Records can change — but only through documented community decisions, and every change leaves an immutable trail. If a record is subverted or altered without authorisation, the subversion attempt is itself timestamped and visible.

**Māori compatibility:**
The strongest approach for Māori communities is positioning the PDC as an anchoring utility behind Māori-built systems (e.g. Āhau), not offering the platform directly to hapū. Co-design with Māori data sovereignty organisations is required before any Māori-facing features are built.

**Build gates before any sovereign rights code:**
- G5: Legal framework reviewed by qualified Pacific, French, and New Zealand counsel as applicable
- G6: Named pilot community confirmed and consulted (Tokelau Apia Liaison Office is the recommended first contact)

---

## 23. Design-Partner Programme — Critical Path

The design-partner programme is critical path, not nice-to-have. It serves two functions simultaneously that cannot be separated:

**Function 1 — Leaderboard volume engine.** The x402 Global Challenge leaderboard measures real Mainnet transaction volume in October 2026. Without active agent developers querying PDC endpoints, leaderboard volume will be minimal regardless of how many providers are listed. Design partners generate this volume.

**Function 2 — Silver bootstrap.** Pilot providers need 3 verified purchaser upvotes to reach Silver tier before the competition measurement window. Design partners are the most likely source of the first real paid queries and therefore the first upvotes.

**What design partners receive:** Early API access, direct SBP technical support, co-marketing as founding integration partners in the developer documentation.

**What SBP needs from them:** Active queries during the competition window, feedback on Pacific Data Protocol schemas, ratings submitted after queries.

**Target:** 5-10 agent developer teams building Pacific-relevant tools (climate models, fisheries analytics, trade intelligence, agricultural commodity platforms).

**Timeline:** Outreach begins at Phase 1 completion (first Mainnet endpoint live). First confirmed design partner before Phase 2.

---

## 24. OGIP Scope — Minimal Phase 0 in Parallel

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

## 25. Legal Framework — Pathway Without Upfront Cost

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

## 26. Known Architectural Patterns and Debugging Reference

This section documents non-obvious behaviour discovered during build sessions. Check here before spending time debugging symptoms that have known root causes.

---

### 26.1 PostgREST !inner Join RLS Behaviour

**Discovered:** Session 13/14 (August 7, 2026)
**Symptom:** Directory search returns zero results despite endpoints existing in the database. Direct SQL queries return correct results. Payment succeeds (HTTP 200) but response is `{ results: [], totalCount: 0 }`.

**Root cause:** When using `supabase-js` with the service role key and an `!inner` join — e.g. `.select("*, providers!inner(*)")` — PostgREST applies RLS on the joined table independently of the requesting role. Even with the service role key bypassing RLS on the primary table, a joined table with no permissive policy for the `anon` role returns zero rows silently, with no error.

**Fix:** Add a public read policy on any table used in an `!inner` join where public visibility is intended:

```sql
CREATE POLICY "table_public_read"
  ON table_name
  FOR SELECT
  TO anon
  USING (is_active = true);
```

**In PDC:** The `providers` table was missing this policy. Fix applied in `supabase/migrations/session13_providers_public_read_rls.sql`.

**Check this first** if directory search ever returns zero results despite correct endpoint data in the database.

---

### 26.2 Agent Form Enum Values Architecture

**Confirmed:** Session 14 (August 7, 2026)
**This is the pattern to follow when adding new agents — not a bug fix.** Session 14's intelligence report initially treated a mismatch between agent form dropdown values and API enum values as a suspected bug. A full read of the architecture plus a live curl against the Mainnet-deployed agents service confirmed the values were already correct at every layer — there was nothing to fix.

**The correct architecture:**
1. `packages/shared-types/src/agent-registry.ts`'s `AGENT_REGISTRY` is the single source of truth for every agent's field list. Each `kind: "select"` field's `options` array pairs a `value` (the exact lowercase snake_case string the backend expects — e.g. `"stock_assessment"`) with a `label` (the human-readable display text — e.g. `"Stock Assessment"`).
2. `apps/web/components/ui/select.tsx`'s generic `Select` component wires `option.value` to the rendered `<option value>` and `option.label` to its display text — never the reverse.
3. `apps/agents/src/agents/*.ts`'s Zod `inputSchema` (`z.enum([...])`) uses the identical lowercase snake_case values as the registry's `options[].value`.

Because `AGENT_REGISTRY` is imported by both `apps/web` (for the form) and referenced by `apps/agents`' own registry (for the wire schema), the same value can't silently drift between what the dropdown sends and what the schema expects — they're sourced from one file, not two hand-maintained copies (see the Session 8 "Flag 8" comment at the top of `agent-registry.ts`, which is exactly the failure mode this structure prevents).

**When adding a new agent with select fields:** add the field's `options` to its `AGENT_REGISTRY` entry with correct lowercase snake_case `value`s matching the agent's Zod `inputSchema` enum exactly. Do not hand-write `<option>` values in `AgentRunForm.tsx` — it has none; it renders generically from the registry.

---

### 26.3 sbp-agent Category Configuration

**Confirmed:** Session 14 (August 7, 2026)
**Configuration, not a bug fix.** sbp-agent's category selection was found hardcoded to `"fisheries"` only — never random, never wrong, and the fisheries pilot endpoint was always active. Session 14 made the primary category configurable and added sequential multi-category querying per tick, generating volume against every active pilot endpoint rather than one.

**Current behaviour:** `apps/sbp-agent`'s `SEARCH_CATEGORY` env var (default `"fisheries"`) sets the primary category. `index.ts` builds a deduplicated category list — `[SEARCH_CATEGORY, "ocean"]` — and `tick()` runs one full `runQueryCycle()` (directory search + endpoint `/summary` query) per category, **sequentially**, not in parallel (the agent wallet signs one transaction at a time; parallel signing against the same key adds settlement-ordering risk for no benefit at this query volume). Each cycle's result — including which `category` it ran — is collected into `lastCycles: CycleResult[]`, returned by the `/health` endpoint.

**Currently queries:** `fisheries` and `ocean` — the two categories with active pilot endpoints.

**To add a new category once a pilot endpoint exists for it:**
1. Confirm the new category has at least one `is_active = true` endpoint in the `endpoints` table with a provider that is also `is_active = true` (see 26.1 — the providers RLS policy must permit `anon` read, or the directory search will return zero results even with a correctly-configured endpoint).
2. Either set `SEARCH_CATEGORY` in Railway (`@pdc/sbp-agent` → Variables) to the new category — replacing, not adding to, the primary slot — or extend the hardcoded `"ocean"` entry in `index.ts`'s `categories` array if more than two categories should run every tick.
3. Redeploy `@pdc/sbp-agent` for the change to take effect.

**Check `SEARCH_CATEGORY` in Railway `@pdc/sbp-agent`** if automated queries show `results_count: 0`.

---

### 26.4 Supabase Built-In Email Rate Limit on OTP Send

**Discovered:** Session 16/hotfix (August 13, 2026)
**Symptom:** "Already registered? Continue where you left off" (`ResumeOtp.tsx`) shows "Could not send a code right now. Please try again shortly." on every attempt, even for a previously-working email.

**Root cause:** No custom SMTP provider has ever been configured for this Supabase project — confirmed by searching the full repo and git history for `signInWithPassword`, `resetPasswordForEmail`, `smtp`, and `resend`: no matches outside CLAUDE.md's planning text and locale strings. OTP emails run on Supabase Auth's built-in email sender, which enforces a strict send rate limit unsuitable for repeated testing or real usage volume. Confirmed via `mcp Supabase query_logs` against the `pacific-data-commons` project (`poiiwcbriqwczmppoevd`): repeated `/otp` and `/recover` calls failing with `error_code: "over_email_send_rate_limit"` (HTTP 429). `sendResumeOtp()` in `lib/onboarding/resume.ts` only checked `if (error)` and returned one static message for every failure mode, with nothing logged server-side — a rate limit, a broken project config, and a genuine outage were all indistinguishable from the UI or the logs.

**Fix applied (partial):** `sendResumeOtp()` now logs the real Supabase error (`status`, `code`, `message`) and, when the error is this specific rate limit, returns an honest message plus `resetInSeconds` parsed from Supabase's own "after N seconds" text — the existing countdown UI in `ResumeOtp.tsx` already supports `resetInSeconds`, it just never received one from this path before.

**Not fixed by code — operational action required:** the actual fix is configuring custom SMTP for Supabase Auth (Authentication > Emails > SMTP Settings in the Supabase dashboard). Per the confirmed stack (Section 6), Resend is the intended provider. Until that's wired up, OTP send will keep hitting Supabase's built-in limit under any real usage volume, not just repeated testing.

**Check `mcp Supabase query_logs` on `poiiwcbriqwczmppoevd` for `error_code: "over_email_send_rate_limit"`** if OTP send ever silently fails again.

---

### 26.5 Admin Bypass Requirement for Verification Queue Status Checks

**Noted:** Session 16/hotfix, during BUG 2 review (August 13, 2026) — see `docs/bugs/2026-08-13-returning-provider-routing.md`.
**Status:** Requirement documented. Not yet implemented — no code exists for this yet.

Admin accounts (identified by the `ADMIN_EMAIL` environment variable) must bypass the `verification_queue` status check documented in BUG 2 of the report above, and always route to dashboard regardless of onboarding or verification queue status. `ADMIN_EMAIL` must be set in apps/web's Vercel project environment variables (see §26.6's 2026-10-04 correction — apps/web now runs on Vercel, not the Render `pdc-web` service this note originally referenced) — **never hardcoded or committed to any file**, including this one.

When BUG 2 is fixed (`resumeOnboardingSession()` and `startNewDataset()` gaining a real `verification_queue.status` check), that fix must include this bypass at the same time, or an admin account will be locked out by the new status check the moment it ships. See the bug report for open questions (environment scoping, audit logging, blast radius) to resolve before implementing.

---

### 26.6 Cloudflare Workers Migration Outcome (Session, September 22, 2026)

**Migrated and confirmed healthy:** `directory-api`, `financial-rails`, `pilot-endpoint` — all three now run on Cloudflare Workers, deployed via `.github/workflows/deploy.yml`'s matrix job (one job per service, `working-directory` scoped). Confirmed via live `/health` checks and a 10-minute Cloudflare Observability window (`wrangler tail`) showing zero exceptions on `pilot-endpoint` and `financial-rails` after their outage fixes below.

**Two same-session outages, both from the same root cause — check this pattern first if a freshly-migrated Worker 500s on every route:** `pilot-endpoint` and `financial-rails` both went down (every route 500ing, including `/health`) immediately after this session's first-ever CI-driven `wrangler deploy` against them. Both had required env vars (`AVM_ADDRESS`/`SUPABASE_URL` for pilot-endpoint; `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`/`FINANCIAL_RAILS_KEY` for financial-rails) that had only ever existed as **dashboard-added plaintext vars bound to one specific historical version** (visible via `wrangler versions view <old-version-id>` as `Environment Variable` bindings, never under that version's `Secrets:` list, and never present in the repo's `wrangler.toml`). `wrangler deploy` treats the local `wrangler.toml` `[vars]` block as authoritative and replaces the whole variable set rather than merging it — so the first deploy from this repo's actual config silently dropped them. Real `wrangler secret`s (e.g. `SUPABASE_SERVICE_KEY` on pilot-endpoint) survived, since `wrangler deploy` never touches those. Same incident class as `directory-api`'s own 2026-09-05 pre-session hotfix (§ this file's directory-api `wrangler.toml` comments) — it just hadn't hit the other two services yet, because neither had a CI-driven deploy path until this session.

**Fix applied:** public config (`AVM_ADDRESS`) moved into `wrangler.toml` `[vars]` (versioned, survives every future deploy); true secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, a freshly-generated `FINANCIAL_RAILS_KEY`) reset via `wrangler secret put`. `apps/pilot-endpoint/DEPLOY.md` documents the required-secrets list and this failure mode for future sessions.

**Checked and confirmed clean:** `directory-api` — diffed its last pre-CI version's full binding set (`wrangler versions view` on the 2026-09-05 version) against current `wrangler.toml [vars]` + `wrangler secret list`. Every var and secret that existed pre-CI is still present now; nothing was dropped. It escaped the incident above because its own 2026-09-05 hotfix (predating this session) had already moved everything into versioned `[vars]`/real secrets before this session's CI ever deployed it.

**Correction (2026-10-04): `apps/web` is now live on Vercel at `https://pdc.synergybcpacific.com`, not Render.** This reverses the "not Vercel" correction this section previously made — confirmed directly via a live request to `https://pdc.synergybcpacific.com/.well-known/x402` returning `server: Vercel` and an `x-vercel-id` header, and `apps/web/vercel.json` (present in the repo, `buildCommand` building `@pdc/shared-types` then `@pdc/web`). `https://pdc-web.onrender.com` now returns HTTP 503 (confirmed live) — the Render deployment is dead, not just suspended-but-resumable. `apps/web/render.yaml` still exists in the repo (historical — see its own doc comment for why Render was chosen over Workers: pinned to Next.js 14.2.35, `@opennextjs/cloudflare` needs ≥15.5.24, and the Edge-only `@cloudflare/next-on-pages` path doesn't fit this app's Node-only SDKs and 31 server-action files), but it no longer reflects where this app actually runs. Do not use `pdc-web.onrender.com` as this app's current/live URL in any new code, docs, or discovery manifests — use `pdc.synergybcpacific.com`.

**`sbp-agent` and `agents` were assessed and deliberately NOT migrated to Workers** — both have a genuine architectural incompatibility, not just an inconvenient dependency (their `package.json`s are otherwise Workers-clean):

- `sbp-agent`: `src/index.ts` runs a persistent process — `setInterval` re-runs its query cycle every `QUERY_INTERVAL_MINUTES`, storing results in module-level memory that `/health` reads back. Workers has no persistent-process model: an isolate isn't guaranteed to survive between invocations, so a `setInterval` timer has no execution guarantee, and a later `/health` request has no guarantee of landing on the same isolate to read the state back. **Correct fix:** rewrite the tick loop as a Cloudflare Cron Trigger (`scheduled()` handler) and persist cycle results to Supabase so `/health` reads the latest run from a database instead of memory. Scoped as a future project, not a config migration.
- `agents`: `lib/quoteStore.ts` is an in-memory `Map` bridging two separate HTTP requests (`POST /agents/:id/quote` → `POST /agents/:id/execute`) — its own doc comment already flagged it as "sufficient for a single-instance deployment" only. Workers provides no single-instance guarantee (concurrent isolates, no request pinning), so this would produce intermittent "quote not found" errors under real traffic. **Correct fix:** swap the in-memory store for a Supabase table (already a dependency) or Cloudflare KV. Smaller scope than sbp-agent's rewrite, but still a real code change, not a `wrangler.toml` addition.

Both remain on Render, currently suspended (free-tier usage limit, account-wide across all Render services on this account, not a per-service issue). Resume via the Render dashboard ("Upgrade compute plan") when needed. **Do not attempt a drop-in Workers migration for either without doing the rewrite above first** — it will deploy and pass `/health` while breaking silently under real traffic, which is worse than staying on Render.

---

*This is CLAUDE.md v2.2. It is the authoritative document for every Pacific Data Commons session. If anything in this session conflicts with this document, this document wins. Flag the conflict and resolve it before proceeding. Where Parts 1–6 conflict with this document, this document supersedes them. The errata notes in Section 12 identify specific Part 3 sections that are superseded. Decisions 32–38, P11, and the P2 Extension were confirmed in this version based on Fable 5 Part 6 extended design session.*
