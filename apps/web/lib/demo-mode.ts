/**
 * Demo mode — bypasses domain verification for safe platform demonstrations.
 * MUST NEVER be enabled in production (DEMO_MODE not set on Railway prod).
 *
 * Usage: set DEMO_MODE=true and NEXT_PUBLIC_DEMO_MODE=true in .env.local.
 * A visible banner (DemoModeBanner) appears on every page when active.
 */

export const DEMO_MODE = process.env.DEMO_MODE === "true";

export const DEMO_CREDENTIALS = {
  email: "demo@pacific-data-commons.test",
  domain: "pacific-data-commons.test",
  institutionName: "PDC Demo Institution",
  walletAddress: "LN745UCDQNFIBDY6JFW7FNK333MADQZQVQFMCVR3GXXUTB52O2NYPZN3YY",
  contactName: "Dr. Demo User",
  website: "https://pacific-data-commons.test",
} as const;

/**
 * Returns true if domain/email-domain verification should be bypassed.
 * NODE_ENV === "production" is an unconditional kill switch — DEMO_MODE
 * being accidentally left set in a production environment variable must
 * never be enough on its own to disable verification there.
 */
export function shouldBypassVerification(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return DEMO_MODE;
}
