-- Retag 3 policy research paper endpoints from 'governance' to 'research'.
--
-- These 3 rows (seeded session20_category_expansion timeframe, 2026-08-16,
-- predating the Governance quick-filter pill and the SIFA/Samoa jurisdiction
-- intelligence endpoints added 2026-10-15) are structured-query wrappers
-- around SBP policy/research papers, not regulatory data. Decision 42
-- ("Research endpoint category") is the correct home for governance/policy
-- research papers — leaving them tagged 'governance' dilutes that filter
-- pill's intended purpose of surfacing the Samoa SIFA/trustee regulatory
-- intelligence suite specifically.
--
-- NOT auto-applied — SUPABASE WRITE APPROVAL REQUEST. Apply manually via
-- Supabase MCP after user confirms.

UPDATE endpoints
SET data_category = 'research'
WHERE data_sub_category IN (
  'blockchain_adoption',
  'cryptographic_continuity',
  'law_before_code'
);
