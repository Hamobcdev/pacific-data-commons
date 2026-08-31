import { z } from "zod";

/**
 * CLAUDE.md P4: no secrets in code, no defaults for anything that touches
 * money or auth. Fails fast at boot rather than surfacing as a 500 later.
 *
 * PORT defaults to 8790 — distinct from apps/directory-api's 8787 so both
 * services can run locally side by side without a collision. This service
 * has no public Railway domain (Session 39 preamble: "NO public-facing
 * routes — internal only"); PORT still matters for Railway's internal
 * networking and for local dev.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8790),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1, "SUPABASE_SERVICE_KEY is required"),

  // Shared secret gating every route except /health — sent as
  // `Authorization: Bearer <FINANCIAL_RAILS_KEY>`. Same posture as
  // apps/directory-api's COMPLIANCE_API_KEY/INTERNAL_API_KEY: required, not
  // optional, so an unset key fails fast at boot rather than silently
  // comparing against undefined.
  FINANCIAL_RAILS_KEY: z.string().min(1, "FINANCIAL_RAILS_KEY is required — gates every /financial-rails route except /health"),
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
