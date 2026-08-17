-- Session 23 (Deliverable 2B): register the third SBP working paper
-- (Decision 42, same Tier 1 cap and directory-listing pattern as
-- session21_competition_prep.sql's two research rows). data_sub_category
-- 'invisible_infrastructure' disambiguates this row from the other two
-- research rows and from fisheries/ocean — resolveDirectoryContext()
-- matches on (endpoint_url, data_category, data_sub_category).
--
-- NOT auto-applied by this migration file landing in the repo — apply
-- manually after @pdc/pilot-endpoint is redeployed with the
-- /research/invisible-infrastructure route live, same order-of-operations
-- as session21's rows (endpoint must resolve before the boot-time sanity
-- check in index.ts stops warning about it).

INSERT INTO endpoints (
  provider_id, data_category, data_sub_category, title, description,
  endpoint_url, health_check_url, integrity_url,
  geography_region, time_period_start, time_period_end, update_frequency,
  pricing_tiers, sensitivity_level, commercial_eligibility,
  competition_tag, bazaar_registered, is_active
) VALUES (
  '23688689-502a-437d-939b-3288d8292534', 'governance', 'invisible_infrastructure',
  'The Invisible Infrastructure: How Global Financial Standards Are Being Built on Blockchain Technology',
  'Working paper documenting how BIS, IMF, FATF, SWIFT, and IMO standards are built on distributed ledger technology and why Pacific governments do not know it. Practitioner research from Samoa. SBP-WP-2026-003 v1.2.',
  'https://pdcpilot-endpoint-production.up.railway.app', 'https://pdcpilot-endpoint-production.up.railway.app/health', 'https://pdcpilot-endpoint-production.up.railway.app/integrity',
  'Pacific', 2026, 2026, 'static',
  '[{"tier":1,"name":"summary","description":"Key arguments, fraudulent schemes documented, standards built on DLT, policy gaps, recommendations, citation. Supports ?tier=summary|slice|full.","price_usdc":0.01,"path":"/research/invisible-infrastructure"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', false, true
);
