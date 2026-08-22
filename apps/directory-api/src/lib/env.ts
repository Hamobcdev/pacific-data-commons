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
