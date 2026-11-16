# Intelligence Report — x402 Doctor Re-scan Findings (Fizzl, 16 Nov 2026)

**Date:** 17 November 2026
**Scope:** `apps/directory-api` (api.synergybcpacific.com) and `packages/pdc-x402-adapter`
**Trigger:** Frits Zwager (Fizzl) x402 Doctor re-scan email, 16 Nov 2026 22:24 CET
**Excluded by decision:** the GoPlausible Bazaar ghost entries (old Railway hosts and the URN-style entries). These are held by GoPlausible and will be removed on their side. No action from us.

## Method

1. Read every finding against `main` at `320cebf` (PR #225, `/tourism/search` 402-first).
2. Confirmed `main` was deployed: Deploy to Cloudflare Workers run #173 succeeded at 2026-11-16 04:14 UTC, about 17 hours before Frits's scan.
3. Built the real app (`createApp()`, the real payment gate, the facilitator `/supported` call stubbed) and called **every GET entry in `paidRoutes` bare**, with no query params and no payment. This is what a crawler does. Recorded the status, the `PAYMENT-REQUIRED` header, and the body.
4. Read `@x402/hono` / `@x402/core` 2.30.0 source, the pinned versions, to confirm gate behaviour rather than assume it.

The live host could not be reached from the session environment. The local scan uses the deployed commit, so it shows what production serves.

## Findings vs. reality

| # | Frits's finding | Status before this change | Evidence |
|---|---|---|---|
| 1 | 8 routes answer 400 when called without params | **Confirmed. 7 of his 8 are still open, plus 1 he didn't list.** | The scan returned 400 for `/pacific/weather`, `/intelligence/pacific-travel`, `/algorand/wallet-balance`, `/finance/crypto-history`, `/fisheries/pacific-purse-seine`, `/finance/fiji-gdp`, `/climate/ocean-temperature` and `/tourism/transport/routes`. `/tourism/search` already returned 402. PR #225 fixed it, so his list probably came from a cached crawl. |
| 2 | 402 body doesn't mirror the header | **Confirmed.** | The body was `{"error":"Payment required"}` on every route. `@x402/core` `createHTTPResponse()` only fills the body from `unpaidResponseBody`, which PDC never set. |
| 3 | No `/openapi.json` | **Confirmed.** | 404. Nothing in the repo generated one. |
| 4 | `/.well-known/x402` has no list of resources | **Confirmed.** | The manifest had a detailed `endpoints[]` but no flat `resources[]` of URLs. It was also stale: "36 live endpoints" and Algorand as the only network. |
| — | x402-merchant `[WARN]` | **Fixed earlier** (PR #224). Frits confirms it has cleared. | — |
| — | Base + Solana in the 402 | **Fixed earlier.** Frits confirms 54/62 payable, each offering all three chains. | — |

### Root cause of finding 1 — the 10 Nov fix rested on a wrong premise

`middleware/preGateRequiredParams.ts` (PR from 11 Nov, commit `b551d71`) assumed the gate answers a bare request with a 402 that has **no** `PAYMENT-REQUIRED` header. It then returned a 400 before the gate to "fix" that. The premise was wrong:

- the real gate returns a complete 402 challenge for a bare URL. The middleware's own test file already proved this for `/tourism/search` after PR #225;
- unpaid requests never reach the route handler, so a missing param can't break anything before payment.

The 400 hid these routes from every crawler that calls the listed URL as-is. Those are the routes that matter most for Pacific-specific demand, including weather (the route Frits's Trust Index shows as payable 30 of 30 days when it is called with params).

The real risk the pre-gate guarded against is a buyer paying for a request the handler then rejects. That risk only exists for requests that carry a payment. `@x402/hono` 2.30.0 already cancels settlement for any handler response ≥ 400 (`index.mjs`, `if (res.status >= 400) { cancellationDispatcher.cancel(...) }`), so the buyer is protected either way.

## Fixes applied (branch `claude/great-albattani-l0m8wc`)

1. **402-first on all routes.** `preGateRequiredParamValidation()` now runs only when the request carries a `PAYMENT-SIGNATURE` header, which is the one header `@x402/core`'s `extractPayment()` reads. Unpaid bare calls get the full 402. A paid call that is missing a param still gets the 400, before any verification, so it is never charged.
2. **The 402 body mirrors the header.** `mirrorPaymentRequiredIntoBody()` in `gate-shared.ts` decodes the `PAYMENT-REQUIRED` header with `@x402/core`'s own `decodePaymentRequiredHeader()` and returns it as the JSON body, so the two can't drift. It applies to both gates (directory-api and pilot-endpoint). It leaves HTML paywall responses and non-402 responses alone.
3. **`/.well-known/x402` gains `resources[]`, `networks[]` and `openapi`.** `resources` is derived from `paidRoutes` (GET only). `:nation_code` is filled with `WS`. Routes whose id param has no public example are left out. `networks` comes from the new `PdcUnifiedPaymentGate.acceptedNetworks()`, so the manifest can't list a chain the gate isn't really offering. The description count is now computed. The existing `network`/`caip2` fields are kept for backwards compatibility (P6).
4. **`/openapi.json` (new, free).** An OpenAPI 3.1 spec generated from `paidRoutes` and each route's Bazaar discovery schema. It includes query and path params, example responses, the documented 402 challenge, and an `x-x402` block (price, chains) on every operation. It is linked from `/` and `/.well-known/x402`. `DIRECTORY_QUERY_PRICE_USDC` moved into `routeSchemas.ts` so the spec and the gate share one constant.

**Verification:** a re-scan of all 65 GET `paidRoutes` entries returned **65/65 as 402 with the header and a body carrying `accepts[]`**. `/openapi.json` and `/.well-known/x402` both return 200 with the new fields. Test suites: directory-api 732/732, pdc-x402-adapter 38/38, pilot-endpoint 52/52. Type checks are clean.

## Still open (not in this change)

| Item | Why it matters | Suggested next step |
|---|---|---|
| **Base/Solana settlements aren't written to Supabase.** `app.ts` `onSettled` logs them as structured logs only. | No Base or Solana payment can be shown in any report, not even a canary. | Add a chain-agnostic settlement table (migration, RLS), or extend `transactions_log` with `chain`/`tx_id`. This needs a schema decision. |
| **All 30-day paid volume is the SBP canary wallet** (1,615 queries, $247.76, one payer: `AGENT_WALLET_ADDRESS`). | Under `volume-integrity-policy.json`, none of it counts as demand. A report has to present it as uptime evidence, not traction. | Label any Base/Solana canaries the same way. Outside volume has to come from discovery work (MCP server, x402scan and nohumans listings, free samples) and design partners (§23). |
| Bazaar ghost entries | — | Excluded by decision; GoPlausible removes them. |

## Recommended sequencing

1. Merge and deploy this branch. Confirm the live `/pacific/weather` returns 402 and `/openapi.json` returns 200.
2. Send Frits the routes for an x402 Doctor re-check. Expect 62/62 payable.
3. Reply to Cameron with a go once item 2 confirms. The report then shows every endpoint asking for payment first.
4. Add the settlement table so Base and Solana canaries and buyers are visible, then run labelled canaries on both chains.
