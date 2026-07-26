import { z } from "zod";

/**
 * CLAUDE.md P4: no secrets in code, no defaults for anything that touches
 * money or auth. Fails fast at boot rather than surfacing as a 500 later.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  ALGORAND_NETWORK: z.enum(["mainnet", "testnet"]).default("testnet"),
  AVM_ADDRESS: z.string().min(1, "AVM_ADDRESS (SBP directory payTo wallet) is required"),
  FACILITATOR_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1, "SUPABASE_SERVICE_KEY is required"),
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
