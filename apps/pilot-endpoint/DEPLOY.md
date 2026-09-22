# Deploying pdc-pilot-endpoint

## Required secrets and variables

`src/types/env.ts`'s zod schema is the source of truth. As of this writing:

| Name | Kind | Where it lives | Required? |
|---|---|---|---|
| `NODE_ENV`, `ALGORAND_NETWORK`, `FACILITATOR_URL`, `PUBLIC_URL`, `LOG_LEVEL` | Public config | `wrangler.toml` `[vars]` | Has defaults except `FACILITATOR_URL`/`PUBLIC_URL` |
| `AVM_ADDRESS` | Public wallet address (not a secret — meant to be known) | `wrangler.toml` `[vars]` | **Required, no default** |
| `SUPABASE_URL` | Secret | `wrangler secret put SUPABASE_URL --name pdc-pilot-endpoint` | **Required, no default** |
| `SUPABASE_SERVICE_KEY` | Secret | `wrangler secret put SUPABASE_SERVICE_KEY --name pdc-pilot-endpoint` | **Required, no default** |

Any of the three **Required, no default** rows missing means `loadEnv()` throws at the top of every request (`worker.ts` → `createApp()`), and **every route 500s, including `/health`** — there is no partial-degradation mode. Check with:

```
npx wrangler secret list --name pdc-pilot-endpoint   # only shows secrets, not [vars]
npx wrangler versions view <latest-version-id> --name pdc-pilot-endpoint   # shows the full effective binding set for that version
```

## The 2026-09-22 outage (why this file exists)

`AVM_ADDRESS` and `SUPABASE_URL` were originally set on 2026-09-05, but as **dashboard-added plaintext environment variables bound to one specific version** (`wrangler versions view` on that version shows them as `Environment Variable` bindings, not under its `Secrets:` list) — not as real `wrangler secret`s, and not present anywhere in this repo's `wrangler.toml`. `wrangler.toml`'s own comment at the time incorrectly assumed this worker had never been deployed before and so had no dashboard config at risk.

On 2026-09-22, the very first `wrangler deploy` ever run against this worker from this repo's actual `wrangler.toml` (via the newly-fixed GitHub Actions workflow) treated the local `[vars]` block as authoritative and replaced the whole variable set — `wrangler deploy` does not merge `[vars]` with whatever the dashboard already had, it overwrites. `AVM_ADDRESS` and `SUPABASE_URL` (plus several other unused, stale vars — `DIRECTORY_URL`, `PILOT_PUBLIC_URL`, `PORT`, `ALGORAND_INDEXER_URL`, `QUERY_INTERVAL_MINUTES`, `SBP_CONTACT_EMAIL` — none of which any current source file reads) were silently dropped. `SUPABASE_SERVICE_KEY` survived because it's a real `wrangler secret`, which `wrangler deploy` never touches.

This is the same incident class `apps/directory-api/wrangler.toml`'s own comments document for that service (Session 40 hotfix, 2026-09-05) — it just hadn't hit pilot-endpoint yet, because pilot-endpoint had no CI-driven deploy path until this session.

**The fix applied**: `AVM_ADDRESS` is now in `wrangler.toml`'s `[vars]` (it's public wallet info, safe to version) — see git history for the commit that added it. `SUPABASE_URL` was reset via `wrangler secret put` directly (never committed, per CLAUDE.md P4).

## Preventing this again

- **Any config `wrangler deploy` needs to keep across redeploys must be in `wrangler.toml` (`[vars]` for public config) or set via `wrangler secret put` / CI secret (for real secrets) — never only via a one-off dashboard click.** A dashboard-only addition survives until the next plain `wrangler deploy`, then silently vanishes.
- Before trusting a deploy, don't just check it succeeded — `curl` `/health` (or any free route) against the live URL. A successful `wrangler deploy` says nothing about whether the resulting Worker can actually serve a request; this outage's deploy reported success every time.
- `.github/workflows/deploy.yml` currently deploys via `npx wrangler deploy` with only `CLOUDFLARE_API_TOKEN` as a secret — it does not set `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` itself, relying on them already being present as Worker secrets (which `wrangler deploy` doesn't touch). That's intentional — CI has no reason to know these values — but it does mean a **brand-new** environment (a fresh Cloudflare account, or a worker recreated from scratch) needs its secrets set manually once, via the commands above, before its first deploy will actually serve traffic. If that one-time step is ever missed, the failure mode is exactly this outage: deploy succeeds, every route 500s.
