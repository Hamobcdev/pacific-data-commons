import { z } from "zod";

/**
 * CLAUDE.md P4: no secrets in code, no defaults for anything that touches
 * money or auth. Fails fast at boot rather than surfacing as a 500 later.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  // Session 18 — this service's own public base URL, used to build the
  // versions_url field in dataset-update notification payloads (Decision 53).
  PUBLIC_URL: z.string().url().default("http://localhost:8787"),
  ALGORAND_NETWORK: z.enum(["mainnet", "testnet"]).default("testnet"),
  AVM_ADDRESS: z.string().min(1, "AVM_ADDRESS (SBP directory payTo wallet) is required"),
  FACILITATOR_URL: z.string().url(),

  // Session 26 — public Algorand address of apps/sbp-agent's operational
  // wallet, published on /health so a third party can cross-reference the
  // agent's own hourly monitoring transactions against Mainnet leaderboard
  // volume (Volume Integrity Policy). Optional: /health must never fail
  // because this wasn't set, it just omits the canary block's wallet.
  AGENT_WALLET_ADDRESS: z.string().optional(),

  // Session 27 — apps/web's public base URL, used only to build
  // canary.policy_url on /health (the Volume Integrity Policy document
  // lives at apps/web/public/.well-known/volume-integrity-policy.json,
  // a different Railway service from this one). Optional, same posture as
  // AGENT_WALLET_ADDRESS above: /health omits policy_url rather than
  // failing when this isn't set.
  WEB_APP_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1, "SUPABASE_SERVICE_KEY is required"),

  // Session 17 — shared secret gating the /internal/* routes (service-to-
  // service only: apps/agents calling in before every endpoint payment).
  // Required, not optional: an unset key would otherwise mean either "every
  // call 401s" (safe but silently breaks agents) or "compare against
  // undefined" (a real vulnerability if that were ever made to pass) — P4
  // fails fast at boot instead of leaving that ambiguous.
  INTERNAL_API_KEY: z.string().min(1, "INTERNAL_API_KEY is required — gates the /internal/* service-to-service routes"),

  // Session 38 — shared secret gating the /compliance/* AML/KYC stub routes
  // (service-to-service only, same posture as INTERNAL_API_KEY above: an
  // unset key must fail fast at boot per P4 rather than silently comparing
  // against undefined). Sent as `Authorization: Bearer <key>` rather than
  // X-Internal-Api-Key — the CBS escrow/compliance surface is a distinct
  // trust boundary from the existing agent/cron service-to-service callers
  // of /internal/*, so it gets its own secret rather than reusing theirs.
  COMPLIANCE_API_KEY: z.string().min(1, "COMPLIANCE_API_KEY is required — gates the /compliance/* AML/KYC stub routes"),

  // Resend — Session 17 is this repo's first real integration (see
  // CLAUDE.md Section 26.4: no SMTP/Resend provider has been configured
  // anywhere before now). Optional: a provider-notification email failing
  // to send must never block integrity event recording or agent payments
  // (P4/P5 — the check that matters, the payment block, already happened).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Pacific Data Commons <alerts@synergybp.com>"),

  // Session 29 — GET /algorand/wallet-balance reads live Algorand Mainnet
  // chain state, independent of ALGORAND_NETWORK above (which controls the
  // x402 payment settlement network, not what chain this route queries —
  // the wallet-balance utility is always Mainnet by design). Defaults to
  // Nodely's free public Mainnet endpoint (no token required) so "primary"
  // is genuinely Nodely per CLAUDE.md Section 6, without depending on the
  // paid tier's credentials existing yet. services/algorandBalanceService.ts
  // hardcodes AlgoNode's free tier as the fallback (CLAUDE.md Section 6:
  // "Never single node in production") — not configurable here, since a
  // fallback that shared this same var would defeat the point of it.
  ALGORAND_NODE_URL: z.string().url().default("https://mainnet-api.4160.nodely.io"),
  // Optional bearer for Nodely's paid tier once provisioned — sent as
  // X-Algo-API-Token only when set. The free public endpoint above works
  // without it.
  NODELY_API_TOKEN: z.string().optional(),

  // Session 31 — Pacific Intelligence Orchestrator's payer wallet
  // (GET /intelligence/pacific-brief pays 3 PDC sub-endpoints per run).
  // User-confirmed for the Sep 2026 Monash timeline: this reuses
  // apps/sbp-agent's own operational wallet (the same AGENT_WALLET_KEY
  // value, copied into this service's env too) rather than minting a
  // dedicated orchestrator wallet. Consequence: selfRegisterAgent looks up
  // `agents` rows by wallet address alone (agentSelfRegisterService.ts), so
  // the orchestrator's attribution records resolve to the same existing
  // "SBP Pilot Agent" row sbp-agent's own canary already uses — Orchestrator
  // volume is not separately distinguishable from dogfooding-canary volume
  // on the leaderboard until this is split out.
  // TODO post-Monash: mint a dedicated orchestrator wallet + its own
  // AGENT_WALLET_KEY here, and self-register it under a distinct identity.
  // Optional here (not required-at-boot like apps/agents' own
  // AGENT_WALLET_KEY): this is one route among many in a general-purpose
  // service — an unset key degrades that one route to 503, not a boot
  // failure, same posture as RESEND_API_KEY above.
  AGENT_WALLET_KEY: z.string().optional(),

  // Session 31 — pilot-endpoint's public base URL, the one live PDC
  // provider endpoint the orchestrator queries for fisheries data. Not a
  // secret (a public URL) — a real default rather than required, same
  // posture as ALGORAND_NODE_URL above.
  // Session 40 — pilot-endpoint migrated Railway -> Cloudflare Workers.
  PILOT_ENDPOINT_URL: z.string().url().default("https://pdc-pilot-endpoint.synergyblockchaintf.workers.dev"),

  // Session 31 — Pacific Intelligence Orchestrator synthesis (Claude via
  // @anthropic-ai/sdk). Optional, same posture as AGENT_WALLET_KEY above:
  // GET /intelligence/pacific-brief degrades to 503 when unset rather than
  // failing service boot. CLAUDE_MODEL follows this repo's existing model-id
  // convention (apps/agents' CLAUDE_MODEL, apps/web's assistant route) —
  // Haiku rather than Sonnet here deliberately: synthesis runs on every
  // $0.05 query, so the cheaper/faster model keeps the orchestrator's own
  // margin (price minus ~$0.016 in sub-payments minus synthesis cost)
  // sane at volume.
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default("claude-haiku-4-5"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
