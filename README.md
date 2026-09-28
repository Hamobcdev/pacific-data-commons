# Pacific Data Commons

**Pacific data. Pacific earnings.**

[![Algorand](https://img.shields.io/badge/Algorand-Mainnet-000000?logo=algorand&logoColor=white)](https://algorand.co)
[![x402](https://img.shields.io/badge/x402-payment%20protocol-1d4ed8)](https://dev.algorand.co/resources/x402-on-algorand/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

Pacific Data Commons (PDC) is sovereign digital infrastructure built by **Synergy Blockchain Pacific (SBP)**: an x402-gated data marketplace and USDC micropayment rail that lets Pacific Island institutions — universities, ministries, fisheries agencies, cultural bodies — sell access to their own data directly to AI agents and researchers, without ever handing that data, or the money it earns, to a third party.

SBP does not host provider data, does not custody funds, and does not arbitrate quality disputes. It operates the directory and the payment rail. Everything else stays with the institutions that produced the data.

---

## 1. What This Is

- A **library**: a searchable, x402-gated directory of Pacific data endpoints.
- A **payment rail**: the x402 protocol routing USDC directly from buyers to providers on Algorand.
- An **agent marketplace**: first-party and third-party AI agents that query PDC data on a user's behalf.
- A **sovereign rights layer** (Phase 2+): community-controlled, on-chain records of EEZ management, customary land stewardship, and resource governance decisions.

SBP never touches the underlying data, never holds client funds, and verifies identity — not quality. Full architectural principles and the confirmed decision register live in [`CLAUDE.md`](./CLAUDE.md).

---

## 2. Architecture Overview

PDC is a three-layer system. Data stays on provider infrastructure at every layer; only payment and trust signals move.

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3 — PACIFIC DATA COMMONS (PDC)                            │
│  International commercial data marketplace                      │
│  x402-gated endpoints · AI agents & researchers pay USDC         │
│  directly to Pacific institutions · SBP earns a 3% fee           │
└───────────────────────────────┬───────────────────────────────────┘
                                  │  discovery + payment routing only
┌───────────────────────────────▼───────────────────────────────────┐
│  LAYER 2 — OGIP (Open Government Interoperability Platform)      │
│  Domestic government data exchange                               │
│  Ministry-to-ministry sharing with contribution scoring           │
│  Jurisdiction-aware, configurable per adopting nation              │
└───────────────────────────────┬───────────────────────────────────┘
                                  │  providers host, SBP lists
┌───────────────────────────────▼───────────────────────────────────┐
│  LAYER 1 — DATA PRODUCTION LAYER                                  │
│  Pacific universities, ministries, agencies, cultural institutions│
│  Data stays on provider infrastructure — it never moves to SBP    │
│  Providers host their own endpoints; SBP lists them               │
└─────────────────────────────────────────────────────────────────┘
```

The jurisdiction field exists only in OGIP-layer tables. It never appears in PDC international-layer tables (`providers`, `endpoints`, `transactions_log`) — regional institutions (USP, SPREP, SPC) transact as ordinary international providers.

---

## 3. Live x402-Gated Endpoints

All five endpoints run on Cloudflare Workers, deployed from each app's own `wrangler.toml` via `.github/workflows/deploy.yml`. Only `@pdc/directory-api` is bound to the `api.synergybcpacific.com` custom domain (see its `wrangler.toml` `routes` block) — `@pdc/pilot-endpoint` has no custom domain and is reachable only at its own `workers.dev` subdomain. Prices are in USDC on Algorand Mainnet (ASA `31566704`).

| Endpoint | App | Domain | Price (USDC) | Category |
|---|---|---|---|---|
| `GET /search` | `@pdc/directory-api` | `api.synergybcpacific.com` | $0.01 | Directory search & discovery |
| `GET /summary` | `@pdc/pilot-endpoint` | `pdc-pilot-endpoint.synergyblockchaintf.workers.dev` | $0.01 | Fisheries pilot data (lowest of 5 pricing tiers) |
| `GET /finance/fx` | `@pdc/directory-api` | `api.synergybcpacific.com` | $0.001 | Pacific FX rates (first-party open-data utility) |
| `GET /algorand/wallet-balance` | `@pdc/directory-api` | `api.synergybcpacific.com` | $0.005 | Algorand utility — USDC balance lookup |
| `GET /intelligence/pacific-brief` | `@pdc/directory-api` | `api.synergybcpacific.com` | $0.05 | Orchestrator — composes fisheries + FX + wallet-balance data with Claude synthesis |

`@pdc/financial-rails` exposes no public routes and has no public domain configured — internal-only service (CBS oversight dashboard + compliance engine), confirmed via its own `wrangler.toml` comment.

Every response is Pacific-attributed and any upstream source it wraps is named explicitly — PDC does not launder external data as its own. Agent-facing discovery metadata is published at `/.well-known/x402-directory.json`.

---

## 4. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | TypeScript, Next.js 14 (App Router), Tailwind CSS |
| Directory & utility APIs | Hono (TypeScript), Cloudflare Workers |
| Database | Supabase (PostgreSQL), Row-Level Security on every table |
| Blockchain | Algorand Mainnet |
| Settlement asset | USDC (ASA `31566704`) |
| Payment protocol | x402, via the GoPlausible facilitator |

---

## 5. The x402 Adapter Pattern

Every PDC service talks to x402 through one internal module — [`packages/pdc-x402-adapter`](./packages/pdc-x402-adapter) — and never imports `@x402/*` packages directly anywhere else in the codebase. This keeps payment-protocol version bumps, facilitator failover handling, and payment-verification logic centralised in one place instead of duplicated (and drifting) across five separate apps.

---

## 6. Repository Structure

Monorepo managed with pnpm workspaces (`pnpm-workspace.yaml`: `apps/*`, `packages/*`, `scripts`).

```
.
├── apps/
│   ├── agents/            @pdc/agents — six first-party AI agent runtimes (trade,
│   │                      climate, fisheries, agricultural, remittance, grants);
│   │                      query PDC endpoints via x402 and synthesise with Claude
│   ├── directory-api/     @pdc/directory-api — x402-gated search/discovery API;
│   │                      also hosts /finance/fx, /algorand/wallet-balance and
│   │                      /intelligence/pacific-brief; api.synergybcpacific.com
│   ├── financial-rails/   @pdc/financial-rails — internal-only CBS oversight
│   │                      service (payment providers, reserve positions,
│   │                      compliance checks); no public routes
│   ├── pilot-endpoint/    @pdc/pilot-endpoint — synthetic Pacific fisheries data,
│   │                      all 5 x402 pricing tiers, competition entry baseline
│   ├── sbp-agent/         @pdc/sbp-agent — SBP's own scheduled agent; queries the
│   │                      directory and pilot endpoint on an interval, generating
│   │                      baseline x402-global-challenge leaderboard volume
│   └── web/                @pdc/web — provider onboarding, buyer search, agent
│                            marketplace UI, admin dashboards
├── packages/
│   ├── pdc-x402-adapter/   @pdc/x402-adapter — the only permitted entry point to
│   │                       @x402/* packages (see §5 above)
│   └── shared-types/       @pdc/shared-types — TypeScript interfaces matching the
│                            Supabase schema exactly; types only, no runtime code
├── scripts/                 seed-pilot.ts, register-agents.ts — one-off setup/ops
│                            scripts run against a target Supabase project
├── supabase/migrations/      All schema migrations, in session order
├── docs/                     Bug reports and setup checklists
└── CLAUDE.md                 Authoritative architecture, decision register, and
                               session build log — supersedes any conflicting plan
```

---

## 7. Getting Started

### Prerequisites

- Node.js ≥ 20
- pnpm 10.33.0 (pinned via `packageManager` in the root `package.json`)
- A Supabase project (for any app that reads/writes application state)
- An Algorand wallet opted in to USDC, if you intend to make real x402 payments locally

### Environment variables

Each app defines and validates its own environment schema — see `apps/<app>/.env.example` for the authoritative list per service, and the root [`.env.example`](./.env.example) for values shared across apps. Names only, no values are committed:

- **Shared**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ALGORAND_NETWORK`, `FACILITATOR_URL`, `AVM_ADDRESS`
- **`apps/directory-api`**: `NODE_ENV`, `PORT`, `ALGORAND_NODE_URL`, `AGENT_WALLET_ADDRESS`, `WEB_APP_URL`, `LOG_LEVEL`, `INTERNAL_API_KEY`, `COMPLIANCE_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `NODELY_API_TOKEN`, `AGENT_WALLET_KEY`, `PILOT_ENDPOINT_URL`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`
- **`apps/pilot-endpoint`**: `NODE_ENV`, `PORT`, `PUBLIC_URL`, `LOG_LEVEL`
- **`apps/sbp-agent`**: `PORT`, `LOG_LEVEL`, `DIRECTORY_URL`, `ALGORAND_NODE_URL`, `AGENT_WALLET_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SECRET_NAME`, `AWS_REGION`, `QUERY_INTERVAL_MINUTES`, `SEARCH_CATEGORY`, `INTERNAL_API_KEY`
- **`apps/agents`**: `PORT`, `PUBLIC_URL`, `LOG_LEVEL`, `AGENT_WALLET_KEY`, `ALGORAND_NODE_URL`, `ALGORAND_INDEXER_URL`, `DIRECTORY_API_URL`, `PILOT_ENDPOINT_URL`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `MAX_REQUESTS_PER_MINUTE`, `MAX_QUOTES_PER_HOUR`, `MAX_EXECUTIONS_PER_HOUR`, `TRADE_AGENT_ID`, `CLIMATE_AGENT_ID`, `FISHERIES_AGENT_ID`, `AGRICULTURAL_AGENT_ID`, `REMITTANCE_AGENT_ID`, `GRANTS_AGENT_ID`
- **`apps/financial-rails`**: `NODE_ENV`, `PORT`, `FINANCIAL_RAILS_KEY`
- **`apps/web`**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ALGORAND_NODE_URL`, `NEXT_PUBLIC_DIRECTORY_API_URL`, `AGENTS_SERVICE_URL`, `NEXT_PUBLIC_AGENTS_MARKETPLACE_ENABLED`, `NEXT_PUBLIC_ALGORAND_NETWORK`, `NEXT_PUBLIC_SBP_UPLOAD_FEE_WALLET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_UPLOAD_FEE`, `STRIPE_PRICE_SCANNED_PDF_SURCHARGE`, `STRIPE_PRICE_DEPLOYMENT_STANDARD`, `STRIPE_PRICE_DEPLOYMENT_COMPLEX`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_SBP_PAYTO_ADDRESS`, `INTERNAL_API_KEY`, `FINANCIAL_RAILS_INTERNAL_URL`, `FINANCIAL_RAILS_KEY`, `ADMIN_EMAIL`, `NEXT_PUBLIC_APP_URL`, `DEMO_MODE`, `NEXT_PUBLIC_DEMO_MODE`

Never commit a real `.env` file — only `.env.example`.

### Local development

```bash
pnpm install

# Run one app at a time (each target builds its internal dependencies first)
pnpm dev:web
pnpm dev:directory-api
pnpm dev:pilot-endpoint
pnpm dev:sbp-agent
pnpm dev:agents
pnpm dev:financial-rails

# Build, test, typecheck across the whole workspace
pnpm build
pnpm test
pnpm typecheck

# One-off setup scripts
pnpm seed-pilot        # seed a pilot provider/endpoint record in Supabase
pnpm register-agents   # register the six first-party agents in Supabase
```

---

## 8. Competition Context

PDC is a competitive entry to the **x402 Global Challenge on Algorand** ($100K USD + 500K ALGO prize pool), entered as a **Composite + Orchestrator** submission — the composite entry spans the directory, payment rail, and pilot provider endpoint, while `/intelligence/pacific-brief` serves as the orchestrator component, composing multiple underlying x402-gated endpoints into a single synthesised, paid response. PDC is registered as a merchant in the **GoPlausible Bazaar** under `api.synergybcpacific.com`, with real Mainnet USDC settling through the GoPlausible facilitator. The competition leaderboard measures genuine Mainnet transaction volume in an unannounced October 2026 window; the prize is a funding event for Phase 2, not the primary objective — the primary objective is production-grade, Pacific-sovereign data infrastructure that outlasts the competition.

---

## 9. Organisation

**Synergy Blockchain Pacific Limited**
Apia, Samoa
Company No. 202307636

Contact: [anthony@synergybcpacific.com](mailto:anthony@synergybcpacific.com)

---

## 10. Licence

MIT — see [`LICENSE`](./LICENSE).
