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
