import { z } from "zod";

/**
 * CLAUDE.md P4: no secrets in code, fail fast at boot. Supabase vars are
 * intentionally not in this schema — logging paid transactions back to the
 * PDC directory is deferred (see .env.example), this endpoint runs
 * standalone without a database.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4021),
  // Decision 2: Mainnet pilot endpoint from Phase 1 — default reflects that,
  // but stays configurable so this same code can run against Testnet locally.
  ALGORAND_NETWORK: z.enum(["mainnet", "testnet"]).default("mainnet"),
  AVM_ADDRESS: z.string().min(1, "AVM_ADDRESS (payTo wallet for all 5 tiers) is required"),
  FACILITATOR_URL: z.string().url(),
  PUBLIC_URL: z.string().url(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
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
