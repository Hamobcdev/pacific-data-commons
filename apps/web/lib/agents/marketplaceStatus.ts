/**
 * Explicit operator-controlled gate — pdc-agents and pdc-sbp-agent are
 * currently suspended on Render (free-tier usage limit, see CLAUDE.md
 * §26.6), so every dry-run/quote/execute call against AGENTS_SERVICE_URL
 * fails. Rather than let a visitor click into that and see a generic
 * "temporarily unavailable" error (which reads as broken, not as a
 * platform still being built), the run flow is hidden behind this flag in
 * favour of an honest, forward-looking notice (AgentMarketplaceComingSoon).
 *
 * Defaults to disabled: anything other than the literal string "true"
 * means the notice shows. This is deliberate — the correct state right
 * now ships even if nobody remembers to set the env var, rather than
 * defaulting to "enabled" and silently exposing a dead backend.
 *
 * Flip NEXT_PUBLIC_AGENTS_MARKETPLACE_ENABLED=true once pdc-agents is
 * confirmed live again. That also restores the correct meaning of the
 * existing "temporarily unavailable, try again" copy in
 * lib/agents/runner.ts and actions/agents/*.ts for genuine future
 * transient failures — this flag deliberately leaves that copy untouched
 * rather than overwriting it, since conflating "suspended for weeks" with
 * "one bad request" would make that wording dishonest once the backend is
 * actually live again.
 */
export function isAgentMarketplaceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AGENTS_MARKETPLACE_ENABLED === "true";
}

/**
 * Same public SBP contact address already used for this exact class of
 * message elsewhere (developers/page.tsx's Resources section,
 * PaymentFlow.tsx's execute-timeout warning) — not ADMIN_EMAIL, which is a
 * server-only env var used to identify the admin account for onboarding
 * bypass (CLAUDE.md §26.5), not a public-facing support address, and isn't
 * even available to client components without a NEXT_PUBLIC_ prefix it
 * doesn't have.
 */
export const AGENT_MARKETPLACE_CONTACT_EMAIL = "anthony@synergybcpacific.com";
