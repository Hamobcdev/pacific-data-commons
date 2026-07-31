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

  DIRECTORY_API_URL: z.string().url(),
  PILOT_ENDPOINT_URL: z.string().url().optional(),

  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required for agent synthesis"),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-6"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),

  MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(10),

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
