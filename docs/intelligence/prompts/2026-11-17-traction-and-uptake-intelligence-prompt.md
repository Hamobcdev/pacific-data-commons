# Intelligence Prompt — Traction and Uptake Readiness (17 Nov 2026)

Paste everything below the line into a new Claude Code session on `Hamobcdev/pacific-data-commons`.

---

## Task

Produce an intelligence report. **This session is read-only: do not change code, apply migrations, deploy, or open a PR.** The only file you write is the report. A separate build prompt will be written from your findings.

Load `sbp-security`, `x402-payment-protocol` and `database-developer` first. CLAUDE.md is authoritative. Flag any conflict with it instead of resolving it yourself.

## Why this matters

Pacific Data Commons has 62 paid routes and no outside buyers. In the last 30 days every paid query (1,615 queries, $247.76) came from SBP's own canary wallet, which Anthony refills to prove the endpoints work. That volume shows uptime, not demand. The goal now is outside transaction volume, and being ready when it arrives. That includes tourism businesses registering themselves.

Two outside reviewers have flagged issues: Frits Zwager (Fizzl, x402 Doctor) and Cameron (who is preparing a signed 30-day report on uptime, whether each endpoint asks for payment first, latency, and accepted networks).

## What is already known — do not redo

Read `docs/intelligence/x402-doctor-rescan-2026-11-17.md` first. Branch `claude/great-albattani-l0m8wc` already fixes the following, with tests passing. It may not be merged or deployed yet. Check, and say which.

- 8 routes answered 400 instead of 402 when called without parameters
- the 402 JSON body did not carry the payment details
- `/.well-known/x402` had no `resources` list
- there was no `/openapi.json`

Leave the GoPlausible Bazaar ghost entries (old Railway hosts) alone. GoPlausible will remove them.

## Questions to answer

Give evidence for every answer: file path and line, a query result, or a live response. Mark anything you could not verify as **unverified**. Do not guess.

### 1. Is the deployed API in the state we think it is?

- Is the branch above merged and deployed? Which commit is live?
- If you can reach `https://api.synergybcpacific.com`, call every GET route in `paidRoutes` bare (no parameters, no payment). Record the status, whether the `PAYMENT-REQUIRED` header is present, and whether the body lists the payment options. Also call `/`, `/openapi.json` and `/.well-known/x402`.
- If the host is blocked, say so. Then build the app locally with the facilitator `/supported` call stubbed and run the same scan.

### 2. Which paid endpoints accept only Algorand?

- `apps/directory-api` uses `PdcUnifiedPaymentGate` (Algorand, Base, Solana). `apps/pilot-endpoint` appears to still use the Algorand-only `PdcPaymentGate`. Confirm this. List every paid route across every app with the chains it actually offers.
- Check `apps/agents` and `apps/sbp-agent` for the same gap. Both are suspended on Render — see CLAUDE.md §26.6.
- For each Algorand-only service, list what moving it to the unified gate needs: env vars, wrangler config, merchant addresses, tests. Take note of the §26.6 failure where `wrangler deploy` drops dashboard-only variables.

### 3. Are Base and Solana payments recorded anywhere we can query?

- Trace `onSettled` in `apps/directory-api/src/app.ts`. Only Algorand appears to reach `transactions_log`.
- Propose the smallest schema change that records all three chains: a new table, or new columns on `transactions_log`. State the RLS policies it needs. It must have no `jurisdiction` field (P3). Buyer activity must stay visible only to the provider concerned and SBP compliance (Decision 40).
- Do not apply it.

### 4. Does a free sample already exist?

Anthony believes one was built. A search of `main` found none on the directory-api paid routes. Settle this:

- search the code, the git history (`git log -S`), open branches, and the live API
- list anything that already acts as a free preview (pilot-endpoint `/schema`, `/provenance`, the web `/demo` pages)
- if it is missing, say which routes should get one and what a sample should return without giving away the paid data

### 5. Which discovery files are stale?

List every file an agent or crawler reads, and whether its endpoint count, chains and prices match the real route list:

- `apps/directory-api/src/routes/agentDiscovery.ts` (`/.well-known/mcp.json`, `/llms.txt`, `/agents.md`, agent card). These appear to still say "36 endpoints" and "Algorand".
- `apps/directory-api/src/routes/discovery.ts` (`/.well-known/x402-directory.json`)
- `apps/web/app/.well-known/x402/route.ts`
- `apps/directory-api/src/routes/root.ts`

### 6. What does a working MCP server need?

Only a static `mcp.json` manifest exists. Report:

- where a small MCP server should live (a new Worker, or a route on directory-api) and why
- how a tool call maps to an x402-paid route, and who pays. P2 applies: no prepaid credits, no SBP custody.
- what the official MCP registry needs for a listing
- what x402scan and nohumans.directory need for a listing

### 7. Can a tourism business register and go live today?

Walk the full path in `apps/web`: `/register` → `actions/tourism/registerProvider.ts` → the database.

- What does the provider pay, and when? What do they see after submitting? Which emails are sent?
- New providers are saved with `verification_status = 'pending'`. No admin review screen was found. How does a pending provider become verified and visible in `/tourism/providers/:nation_code`? If there is no path, say so plainly.
- Check RLS on every tourism table, rate limiting, input validation, and what happens if payment succeeds but the insert fails.
- Check every piece of copy on that path against CLAUDE.md: no promise of easy USDC-to-cash conversion (§15), no quality judgement by SBP (P10), and the pilot disclaimer is shown (§25).

### 8. Is a combined "country snapshot" endpoint allowed, and how should it be priced?

The idea: one call per nation that returns weather, FX, consumer prices, GDP, population and travel advisories. Then an all-Pacific version at a higher price.

- Which existing services can it be built from, and for which of the 13 nations does each have data?
- **Decision 60 caps first-party open-data wrapper endpoints at $0.01 per query.** List which existing routes already charge more than that, and on what basis. State whether a higher-priced snapshot is consistent with Decisions 59–61, or needs Anthony to decide. Do not decide it for him.
- What must each response include (Decision 61: `data_currency`, attribution, temporal bounds)?

### 9. What will Cameron's report show?

For the last 30 days, from Supabase and from whatever health or uptime data exists:

- uptime per endpoint, if it is recorded anywhere
- paid queries by route, by day and by payer wallet. Confirm whether any payer other than the canary wallet exists.
- anything that would look bad in a signed public report, and what fixes it

## Output

Write one file: `docs/intelligence/traction-and-uptake-readiness-2026-11-17.md`.

1. **Summary** — at most ten lines: what is live, what is broken, what is missing.
2. **Findings** — one section per question above, each with a status (confirmed, not found, or unverified) and its evidence.
3. **Issue table** — every issue found, with a category, severity and rough size (small, medium or large). Use these categories:
   - A — Immediate fixes (blocks Frits's re-check or Cameron's report)
   - B — Multi-chain and payment recording
   - C — Discovery and traction (MCP, directories, free sample, descriptions)
   - D — Uptake readiness (tourism registration)
   - E — New endpoints
   - F — Decisions Anthony must make
4. **Recommended build order** — which issues belong in the first build prompt and which wait.
5. **Flags** — anything that touches CLAUDE.md §18: custody, a breaking API change, a schema change to PDC tables, SBP judging quality, licensing.

Keep the report factual. Do not write any fixes.
