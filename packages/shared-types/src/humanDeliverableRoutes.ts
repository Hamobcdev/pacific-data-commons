/**
 * Single source of truth for which paid routes may be sold through the
 * human payment rail (apps/web's email+QR payment flow, token-gated
 * download page, and apps/directory-api's INTERNAL_DATA_FETCH_ROUTES).
 *
 * apps/directory-api's routeSchemas.ts is the authoritative place each
 * route's own humanDeliverable: boolean is actually set (next to that
 * route's own pricing/discovery metadata) — this list is the cross-app
 * contract apps/web's buy-button gating reads, and apps/directory-api's
 * own test suite (routeSchemas.test.ts) asserts the two can never drift
 * apart. Same "one file, not two hand-maintained copies" pattern as
 * agent-registry.ts's AGENT_REGISTRY (see that file's doc comment).
 *
 * A route belongs here only if it is: a GET data route (no path params),
 * needs no c.get("supabase")/c.get("env")/KV binding that the internal
 * delivery route's dispatch doesn't provide, and never triggers an
 * internal x402 sub-payment to another endpoint (rules out the
 * /intelligence/* orchestrators, which also return partly self-disclosed
 * synthetic data).
 */
export const HUMAN_DELIVERABLE_PATHS = [
  "/finance/samoa-cpi",
  "/finance/samoa-gdp",
  "/finance/fiji-gdp",
  "/finance/fiji-cpi",
  "/fisheries/pacific-purse-seine",
  "/finance/arbitrage-signals",
  "/finance/remittance-corridors",
  "/climate/pacific-cyclone-history",
  "/climate/pacific-sea-level",
  "/climate/pacific-enso-index",
  "/finance/pacific-gdp",
  "/demographics/pacific-population",
  "/finance/pacific-cpi",
  "/pacific/samoa-entity-setup",
  "/pacific/samoa-compliance-status",
  "/pacific/samoa-service-providers",
  "/pacific/samoa-banking-setup",
  "/invest/pacific-setup-comparison",
  "/invest/pacific-tax-comparison",
  "/invest/pacific-land-tenure",
  "/invest/pacific-sector-restrictions",
  "/invest/pacific-regulatory-scores",
  "/invest/pacific-setup-checklist",
] as const;

export type HumanDeliverablePath = (typeof HUMAN_DELIVERABLE_PATHS)[number];

const HUMAN_DELIVERABLE_PATH_SET = new Set<string>(HUMAN_DELIVERABLE_PATHS);

/** Prefer this over `.includes()` — tier.path is untyped (read off Supabase JSON), not a HumanDeliverablePath. */
export function isHumanDeliverablePath(path: string): boolean {
  return HUMAN_DELIVERABLE_PATH_SET.has(path);
}
