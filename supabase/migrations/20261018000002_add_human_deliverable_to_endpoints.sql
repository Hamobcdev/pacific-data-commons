-- Bridges apps/directory-api's routeSchemas.ts in-memory humanDeliverable
-- flag into the endpoints table, so apps/web's browse page (which reads
-- Supabase directly, never routeSchemas.ts) can distinguish human-
-- purchasable endpoints from agent-API-only ones at the listing level.
--
-- Backfill list mirrors apps/directory-api/src/routes/internal/data-fetch.ts's
-- INTERNAL_DATA_FETCH_ROUTES keys, which is itself kept in exact sync with
-- routeSchemas.ts's humanDeliverable: true routes by routeSchemas.test.ts's
-- drift check (confirmed 23/23 match, zero gaps, as of this PR).
--
-- NOT auto-applied — SUPABASE WRITE APPROVAL REQUEST. Apply manually via
-- Supabase MCP or the dashboard SQL Editor after Anthony confirms.
--
-- CORRECTED FROM THE BUILD PROMPT'S DRAFT SQL: `endpoints` has no `path`
-- column (verified against the live schema, poiiwcbriqwczmppoevd) — a
-- bare `WHERE path IN (...)` would error with "column path does not
-- exist" the moment this ran. Each tier's path lives inside the
-- `pricing_tiers` jsonb array instead (`PricingTier.path`,
-- packages/shared-types/src/endpoints.ts:59 — same field
-- EndpointPricingCard.tsx's `isHumanDeliverablePath(tier.path)` already
-- reads). Rewritten below as a jsonb_array_elements containment check
-- against any tier's path, since one endpoint row can carry multiple
-- pricing tiers at different backend paths.

ALTER TABLE endpoints
  ADD COLUMN IF NOT EXISTS human_deliverable BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill known human-deliverable paths — TRUE if ANY of this endpoint's
-- pricing tiers points at a path in the list below.
UPDATE endpoints SET human_deliverable = TRUE
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(pricing_tiers) AS tier
  WHERE tier->>'path' IN (
    '/pacific/samoa-entity-setup',
    '/pacific/samoa-compliance-status',
    '/pacific/samoa-service-providers',
    '/pacific/samoa-banking-setup',
    '/invest/pacific-setup-comparison',
    '/invest/pacific-tax-comparison',
    '/invest/pacific-land-tenure',
    '/invest/pacific-sector-restrictions',
    '/invest/pacific-regulatory-scores',
    '/invest/pacific-setup-checklist',
    '/finance/samoa-gdp',
    '/finance/fiji-gdp',
    '/finance/fiji-cpi',
    '/fisheries/pacific-purse-seine',
    '/finance/arbitrage-signals',
    '/finance/remittance-corridors',
    '/climate/pacific-cyclone-history',
    '/climate/pacific-sea-level',
    '/climate/pacific-enso-index',
    '/finance/pacific-cpi',
    '/finance/samoa-cpi',
    '/finance/pacific-gdp',
    '/demographics/pacific-population'
  )
);
