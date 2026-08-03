import { z } from "zod";

/**
 * CLAUDE.md P4: no secrets in code, fail fast at boot. AGENT_WALLET_KEY is
 * deliberately optional — its absence is dry-run mode, not a config error
 * (see agent.ts/wallet.ts). ALGORAND_NETWORK/ALGORAND_NODE_URL aren't in the
 * Session 4 prompt's draft .env.example for this app at all, but wallet.ts's
 * USDC balance check needs both — added here, flagged in the session report.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4022),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  DIRECTORY_URL: z.string().url(),

  // Absent -> dry-run mode (logs what it would pay without paying).
  // DIFFERENT wallet from the payTo addresses (AVM_ADDRESS) used by
  // directory-api/pilot-endpoint — see .env.example for why.
  // Session 8: this is now the AWS Secrets Manager fallback path only — see
  // key-provider.ts. Kept optional so local dev without AWS still works.
  AGENT_WALLET_KEY: z.string().min(1).optional(),

  // Session 8 — AWS Secrets Manager key provider (Priority 1 security item).
  // All optional: getAgentWalletKey() falls back to AGENT_WALLET_KEY above
  // when these aren't set, so this schema doesn't hard-require AWS.
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SECRET_NAME: z.string().optional(),
  AWS_REGION: z.string().optional(),

  ALGORAND_NETWORK: z.enum(["mainnet", "testnet"]).default("mainnet"),
  ALGORAND_NODE_URL: z.string().url().default("https://mainnet-api.algonode.cloud"),

  QUERY_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
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
