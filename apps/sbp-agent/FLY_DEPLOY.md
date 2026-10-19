# sbp-agent — Fly.io deployment checklist

Migrating pdc-sbp-agent from Render (`apps/sbp-agent/render.yaml`) to
Fly.io. See this directory's `Dockerfile` and `fly.toml` for the config
this checklist deploys.

**Read the gotchas at the bottom before your first deploy** — the build
context and the always-on machine setting are both easy to get wrong in
ways that deploy "successfully" and then don't work.

## 1. Install Fly CLI

```
brew install flyctl
```

## 2. Authenticate

```
flyctl auth login
```

## 3. Create the app

```
flyctl apps create pdc-sbp-agent
```

## 4. Set secrets

Run this **from anywhere** (secrets aren't tied to build context) before
the first deploy — see the command block in the audit report / below for
the exact variable names and where to source each value from. Do not put
real values in any committed file.

```
fly secrets set -a pdc-sbp-agent \
  AGENT_WALLET_KEY="<value from Render env — eye icon>" \
  INTERNAL_API_KEY="<value from Render env — eye icon>"
```

## 5. Deploy

**Must be run from the repo root**, not from `apps/sbp-agent/` — the
Dockerfile needs the pnpm workspace (`packages/shared-types`,
`packages/pdc-x402-adapter`, root `pnpm-lock.yaml`) as its build context.
Deploying from inside `apps/sbp-agent/` will fail to resolve the
`workspace:*` dependencies.

```
cd /home/faonelua/mvp/pacific-data-commons
flyctl deploy \
  --config apps/sbp-agent/fly.toml \
  --dockerfile apps/sbp-agent/Dockerfile \
  .
```

## 6. Verify it started

```
flyctl logs -a pdc-sbp-agent
```

Look for the structured startup log lines from `src/index.ts`:
`sbp_agent_starting` (should show `dry_run: false`, the expected
`wallet_address`, and `categories: ["fisheries","ocean"]`), then
`sbp_agent_ready`. If `dry_run: true` appears, `AGENT_WALLET_KEY` (or the
AWS Secrets Manager path) did not resolve — re-check step 4.

Also confirm the machine is actually staying up between ticks, not
cycling:

```
flyctl status -a pdc-sbp-agent
flyctl machine list -a pdc-sbp-agent
```

Exactly 1 machine should show `started`, continuously — not
`stopped`/`started` flapping. If it's flapping, `auto_stop_machines` in
`fly.toml` didn't take effect (see Gotcha 2 below).

## 7. Confirm first settlement appears on GoPlausible

Each tick makes several real x402-settled Mainnet payments (directory
search + pilot endpoint query per category, plus the wallet-balance/fx/
orchestrator/events/tourism/weather canary checks — see
`src/agent.ts`/`src/index.ts`). After the first tick completes
(immediately on boot, then every `QUERY_INTERVAL_MINUTES`, default 60):

- Check `flyctl logs -a pdc-sbp-agent` for `agent_directory_query_succeeded`
  / `agent_endpoint_query_succeeded` log lines with real `tx_id` values
  (not `null` — a `null` tx_id with `dry_run: false` means a payment
  attempt failed, not that it's working).
- Cross-check one of those `tx_id` values against the Algorand Mainnet
  indexer (e.g. `https://mainnet-idx.algonode.cloud/v2/transactions/<tx_id>`)
  to confirm it actually settled on-chain.
- Confirm it surfaces on the GoPlausible Bazaar dashboard
  (facilitator.goplausible.xyz) and the x402 Global Challenge leaderboard
  — allow for its own indexing lag before concluding it's missing.

---

## Gotchas found during the audit (read before deploying)

1. **Build context must be the repo root.** This is a pnpm workspace
   package (`@pdc/sbp-agent` depends on `@pdc/shared-types` and
   `@pdc/x402-adapter` via `workspace:*`). The deploy command in Step 5
   passes `.` (repo root) as the context deliberately — do not simplify
   it to a plain `flyctl deploy` run from inside `apps/sbp-agent/`.

2. **This is not a scale-to-zero service.** The agent's actual job is a
   `setInterval` loop making scheduled payments — it is not driven by
   inbound HTTP traffic, even though it exposes `/health`. `fly.toml`
   sets `auto_stop_machines = "off"` and `min_machines_running = 1`
   specifically to stop Fly from idling the machine out between ticks.
   If a future edit to `fly.toml` "cleans up" these settings back to
   Fly's defaults, the canary's payment schedule will silently stop
   firing without any error — it'll just no longer generate leaderboard
   volume.

3. **`.dockerignore` location is unconfirmed.** Because the build
   context is the repo root (Gotcha 1) but this `.dockerignore` lives at
   `apps/sbp-agent/.dockerignore`, plain Docker/BuildKit may not
   auto-discover it (ignore files are resolved relative to the build
   context root, or via BuildKit's `<dockerfile-path>.dockerignore`
   convention — neither necessarily matches this file's location). The
   Dockerfile's explicit `COPY` list (not `COPY . .`) is the primary
   defence against shipping `node_modules`/`.env`/`dist` into the image,
   so this isn't a security hole — but if a `docker build`/`flyctl
   deploy` log shows an unexpectedly large "sending build context" size,
   check whether this file is actually being honoured, and consider
   duplicating it to the repo root as `.dockerignore` (ask Anthony first
   — that file is shared across every service's builds, not scoped to
   sbp-agent).

4. **Render's actual region is `oregon`, not Singapore.** The task brief
   states this migration is "consistent with current Render Singapore
   region" — `apps/sbp-agent/render.yaml` line 28 actually says
   `region: oregon`. `fly.toml` still uses `primary_region = "sin"` per
   the explicit instruction, but the stated reason for that choice
   doesn't match what's actually deployed today. Worth double-checking
   with Anthony whether `sin` is still the intended region now that the
   "consistent with Render" premise is wrong — Sydney (`syd`) is
   geographically closer to Samoa than either Oregon or Singapore, if
   latency to Algorand Mainnet / GoPlausible / `api.synergybcpacific.com`
   (itself on Cloudflare, not regional) is the actual concern.

5. **AWS Secrets Manager calls are cross-cloud.** `key-provider.ts` calls
   AWS Secrets Manager (`ap-southeast-1` by default) directly over HTTPS
   from wherever the agent runs — no VPC peering needed, this is a
   standard signed AWS API call. Works identically from a Fly VM in
   `sin` as it did from Render in `oregon`; no code or config change
   needed beyond the 3 AWS secrets in Step 4. Latency Fly→AWS
   `ap-southeast-1` from `sin` should if anything be lower than from
   Render's `oregon`.

6. **No persistent disk, no DB.** The agent keeps `lastCycles` /
   `lastWalletBalanceCheck` / etc. in plain in-process memory (read back
   by `/health`) — nothing is written to disk and there's no database
   connection anywhere in `apps/sbp-agent/src/`. A Fly machine restart
   loses that in-memory state exactly like a Render/Railway restart
   already does today; this is not a regression and needs no Fly volume.

7. **AWS SDK pulls in `ca-certificates`.** `node:20-slim` is
   minimal enough that outbound TLS to AWS Secrets Manager can fail
   without system CA certs present — the Dockerfile installs
   `ca-certificates` explicitly. If you swap the base image, keep this.
