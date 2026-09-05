# PDC Infrastructure Migration — Railway → Cloudflare + Render

## Migration date: September 2026
## Reason: Railway trial expired. Cloudflare Workers free tier and Render's free tier are permanent, no-cost alternatives.

## Course corrections from the original migration brief

Two things in the original session brief did not match the actual codebase or
the current adapter ecosystem. Both were confirmed with the user before
proceeding (2026-09-05):

1. **apps/sbp-agent and apps/agents are TypeScript/Node, not Python.** Both
   are Hono + `@hono/node-server` services built with `tsx`/`tsc` — confirmed
   by direct search, no `.py` file or `requirements*.txt` exists anywhere in
   either directory. They deploy to **Render as Node web services**
   (`env: node`, not a Python buildpack), using the same root-relative
   `pnpm run build:<app>` / `node apps/<app>/dist/index.js` commands their
   existing `railway.json`s already used.
2. **apps/web deploys to Render, not Cloudflare Pages.** apps/web is pinned
   to Next.js 14.2.35. `@opennextjs/cloudflare` (Cloudflare's current
   Next.js adapter) requires Next.js ≥15.5.24 — confirmed by a failed peer
   dependency check when the adapter was installed. The older
   `@cloudflare/next-on-pages` requires every route on the Edge runtime,
   which this app isn't set up for (31 server-action files, plus direct
   Node SDK usage — Stripe, Resend, tus-js-client, jszip — with zero
   existing `export const runtime = "edge"` anywhere). Render runs Next.js
   14 on real Node with no code changes required. Cloudflare for web remains
   a future option if/when Next.js is upgraded to 15+.

## Service mapping

| Service | Old (Railway) | New |
|---|---|---|
| @pdc/directory-api | pdcdirectory-api-production.up.railway.app | api.synergybcpacific.com (Cloudflare Workers) |
| @pdc/web | pdcweb-production.up.railway.app | Render (pdc-web) — URL assigned at first deploy |
| @pdc/pilot-endpoint | pdcpilot-endpoint-production.up.railway.app | pdc-pilot-endpoint.synergyblockchaintf.workers.dev |
| @pdc/financial-rails | not deployed | pdc-financial-rails.synergyblockchaintf.workers.dev (internal only, no public domain) |
| @pdc/sbp-agent | pdcsbp-agent-production.up.railway.app | Render (pdc-sbp-agent) — URL assigned at first deploy |
| @pdc/agents | pdcagents-production.up.railway.app | Render (pdc-agents) — URL assigned at first deploy |

## What changed in code (this branch)

- `apps/directory-api`, `apps/pilot-endpoint`, `apps/financial-rails`: each
  split its single `main()` (Hono app + `@hono/node-server`'s `serve()` in
  one file) into:
  - `src/app.ts` — `createApp(env)`, pure Hono app construction, no
    `process.env` access, no `serve()` call.
  - `src/index.ts` — Node local-dev entry point (`pnpm dev`/`pnpm start`),
    calls `loadEnv()` + `createApp()` + `serve()`.
  - `src/worker.ts` — Cloudflare Workers entry point. Builds the app lazily
    on first request (Workers only guarantees `env` bindings are populated
    inside the `fetch` handler, not at module top level) and caches it for
    the isolate's lifetime. Passes the Workers `env` binding straight into
    each service's existing `loadEnv(source)` — that function already
    accepted an arbitrary source object, so no `process.env` shimming was
    needed.
  - `@cloudflare/workers-types` added as a devDependency to each, imported
    explicitly (`import type { ExecutionContext } from "@cloudflare/workers-types"`)
    rather than via ambient globals, to avoid colliding with `@types/node`.
- Hardcoded Railway URLs updated where the new target is confirmed
  (`api.synergybcpacific.com`, the new pilot-endpoint `workers.dev` URL);
  left as-is with a `TODO(session40)` comment where the new target isn't
  knowable yet (apps/web's own domain, apps/agents' Render URL) — see
  "Known follow-ups" below. Left untouched in test fixtures
  (`apps/sbp-agent/test/agent.test.ts`,
  `apps/directory-api/src/__tests__/{freeRoutes,internal}.test.ts`) — those
  assert against mock data, not live config.
- `.gitignore`: added `.dev.vars`, `.dev.vars.*`, `.wrangler/` (wrangler's
  local-secrets and local-state files — same posture as the existing
  `.env`/`.env.local` entries).

## Deployment commands

### directory-api (Cloudflare Workers)
```
cd apps/directory-api && wrangler deploy
```

### pilot-endpoint (Cloudflare Workers)
```
cd apps/pilot-endpoint && wrangler deploy
```

### financial-rails (Cloudflare Workers)
```
cd apps/financial-rails && wrangler deploy
```

### web (Render)
Connect github.com/Hamobcdev/pacific-data-commons to Render.
Blueprint file: `apps/web/render.yaml` (Root Directory: repo root — this is
a pnpm workspace package).

### sbp-agent (Render)
Connect github.com/Hamobcdev/pacific-data-commons to Render.
Blueprint file: `apps/sbp-agent/render.yaml` (Root Directory: repo root).

### agents (Render)
Connect github.com/Hamobcdev/pacific-data-commons to Render.
Blueprint file: `apps/agents/render.yaml` (Root Directory: repo root).

## Environment variables

### Cloudflare Workers — set in dashboard for each worker:
Workers & Pages > [worker-name] > Settings > Variables and Secrets

**directory-api:** PUBLIC_URL, ALGORAND_NETWORK, AVM_ADDRESS, FACILITATOR_URL,
AGENT_WALLET_ADDRESS, WEB_APP_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY,
INTERNAL_API_KEY, COMPLIANCE_API_KEY, RESEND_API_KEY, EMAIL_FROM,
ALGORAND_NODE_URL, NODELY_API_TOKEN, AGENT_WALLET_KEY, PILOT_ENDPOINT_URL,
ANTHROPIC_API_KEY, CLAUDE_MODEL

**pilot-endpoint:** ALGORAND_NETWORK, AVM_ADDRESS, FACILITATOR_URL,
PUBLIC_URL, LOG_LEVEL, SUPABASE_URL, SUPABASE_SERVICE_KEY

**financial-rails:** SUPABASE_URL, SUPABASE_SERVICE_KEY, FINANCIAL_RAILS_KEY

### Render — set via each render.yaml Blueprint, secrets (`sync: false`) filled in dashboard:
Dashboard > [service] > Environment

**pdc-web:** see `apps/web/render.yaml` for the full list (Stripe, Resend,
Supabase, financial-rails internal URL, etc.)

**pdc-sbp-agent:** see `apps/sbp-agent/render.yaml`

**pdc-agents:** see `apps/agents/render.yaml`

## DNS change required (Cloudflare dashboard)

After deploying directory-api to Cloudflare Workers:
1. Go to synergybcpacific.com > DNS > Records
2. Find the 'api' record (currently points to Railway)
3. Go to Workers & Pages > pdc-directory-api > Settings > Domains & Routes
4. Add custom domain: api.synergybcpacific.com — Cloudflare repoints DNS automatically

## Known follow-ups (not resolved by this migration — no guessed URLs)

- **apps/web's own public domain** isn't set — `NEXT_PUBLIC_APP_URL` in
  `apps/web/render.yaml` is `sync: false` pending the Render-assigned URL
  (or a custom domain) from the first deploy.
- **apps/agents' Render URL** feeds three places once known:
  - `apps/web/app/[locale]/(public)/developers/page.tsx`'s `AGENTS_API_URL`
    constant (currently still the stale Railway URL, marked with a
    `TODO(session40)` comment)
  - `apps/web/render.yaml`'s `AGENTS_SERVICE_URL`
- **apps/directory-api's `psrSpec.ts`** — `specification_url`,
  `developer_docs`, and the endpoint-schema `$id` still point at the stale
  `pdcweb-production.up.railway.app` (marked `TODO(session40)`), pending
  apps/web's Render URL/custom domain.
- **apps/pilot-endpoint's merchant identity `url`/`iconUrl`** (in
  `src/app.ts`) — same stale-URL/TODO situation, pending apps/web's
  new address.
- **apps/financial-rails reachability from Render** — apps/web's
  `FINANCIAL_RAILS_INTERNAL_URL` needs either a public
  `pdc-financial-rails.synergyblockchaintf.workers.dev` call gated by
  `FINANCIAL_RAILS_KEY` (current auth model, works cross-network) or a
  Cloudflare Access/service-token layer if a stricter network boundary is
  wanted later. No change needed to go live — the existing Bearer-key auth
  (`financialRailsAuth` middleware) already gates every route but `/health`
  regardless of network path.

## Post-migration verification

```
curl https://api.synergybcpacific.com/health
curl https://api.synergybcpacific.com/psr/v1/nodes
curl https://api.synergybcpacific.com/compliance/status
curl https://api.synergybcpacific.com/.well-known/x402-directory.json
```
