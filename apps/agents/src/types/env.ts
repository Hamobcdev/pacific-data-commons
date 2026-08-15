import { z } from "zod";

/**
 * CLAUDE.md P4: no secrets in code, fail fast at boot. AGENT_WALLET_KEY /
 * AGENT_WALLET_ADDRESS are required (unlike apps/sbp-agent's optional
 * AGENT_WALLET_KEY dry-run mode) — this service exists to spend from an
 * operational wallet on every live run, so an unconfigured wallet here is a
 * deploy misconfiguration, not a valid dry-run-forever state. dry_run is a
 * per-request field on AgentInput instead (R8).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4023),
  PUBLIC_URL: z.string().url().default("http://localhost:4023"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Agent operational wallet — PAYS for PDC endpoint queries (R2/Model F).
  // Different wallet from any provider payTo wallet; format matches
  // @pdc/x402-adapter's ManualPaymentFetchConfig (base64, 64-byte Ed25519 key).
  AGENT_WALLET_KEY: z.string().min(1, "AGENT_WALLET_KEY is required — this service spends real USDC on every live run"),
  ALGORAND_NETWORK: z.enum(["mainnet", "testnet"]).default("mainnet"),
  ALGORAND_NODE_URL: z.string().url().default("https://mainnet-api.algonode.cloud"),
  // Session 13 — verifying a user's on-chain quote payment (execute route)
  // needs a confirmed-transaction lookup by ID, which algod does not serve
  // once a transaction ages out of its recent-transaction cache; only the
  // indexer keeps it permanently queryable. Defaults to AlgoNode's public
  // indexer, the indexer sibling of the ALGORAND_NODE_URL default above.
  ALGORAND_INDEXER_URL: z.string().url().default("https://mainnet-idx.algonode.cloud"),

  DIRECTORY_API_URL: z.string().url(),
  PILOT_ENDPOINT_URL: z.string().url().optional(),
  // Session 17 — shared secret for directory-api's /internal/* routes
  // (certified-hash lookup + integrity event recording), called before
  // every endpoint payment. Same value as directory-api's INTERNAL_API_KEY.
  INTERNAL_API_KEY: z.string().min(1, "INTERNAL_API_KEY is required — authenticates calls to directory-api's /internal/* routes"),

  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required for agent synthesis"),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-6"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),

  MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(10),
  // Session 13 — separate, coarser windows for the user-facing quote/execute
  // routes. A quote costs the agent's own operational wallet a real $0.01
  // directory search per required category (resolveEndpoints() runs for
  // dry_run too), so quote spam has a real cost, not just a compute cost —
  // hence a limit here too, not only on execute.
  MAX_QUOTES_PER_HOUR: z.coerce.number().int().positive().default(20),
  MAX_EXECUTIONS_PER_HOUR: z.coerce.number().int().positive().default(10),

  // Set once each agent is registered via scripts/register-agents.ts —
  // absent in dev before that script has run (agents.ts falls back to a
  // clear startup error naming which one is missing, not a silent 500).
  TRADE_AGENT_ID: z.string().uuid().optional(),
  CLIMATE_AGENT_ID: z.string().uuid().optional(),
  FISHERIES_AGENT_ID: z.string().uuid().optional(),
  AGRICULTURAL_AGENT_ID: z.string().uuid().optional(),
  REMITTANCE_AGENT_ID: z.string().uuid().optional(),
  GRANTS_AGENT_ID: z.string().uuid().optional(),
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
