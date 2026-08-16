-- Session 20: extend endpoints.data_category taxonomy + correct a
-- fabricated health_status value.
--
-- 1) Category expansion (Fix 6): adds governance, financial_flows, and
--    research to the 18-value CHECK constraint from session1_migration.sql.
--    Postgres has no ALTER-in-place for CHECK constraints — drop and
--    recreate under the same name, additive only, no existing value removed
--    or renamed, so no existing row can violate it.
ALTER TABLE endpoints DROP CONSTRAINT endpoints_data_category_check;

ALTER TABLE endpoints ADD CONSTRAINT endpoints_data_category_check CHECK (data_category IN (
  'fisheries', 'climate', 'trade', 'demographics',
  'health', 'agriculture', 'cultural', 'remittance',
  'legal', 'geospatial', 'energy', 'carbon',
  'tourism', 'disaster_risk', 'biodiversity',
  'ocean', 'education', 'governance', 'financial_flows',
  'research', 'other'
));

-- 2) Health status correction: the ocean pilot endpoint row shows
-- health_status = 'healthy' with last_health_check_at still NULL — no
-- automated health-checker exists anywhere in this codebase (confirmed by
-- searching for any code that writes endpoints.health_status; there is
-- none — the "Railway cron, every 5 min" checker documented in CLAUDE.md
-- Section 6 was never built), so a 'healthy' value that was never actually
-- checked is a fabricated status, same class of problem as the placeholder
-- testimonials this session also removes. Reset it to the column's own
-- default so both pilot endpoints honestly read 'unknown' until a real
-- checker exists to earn that badge.
UPDATE endpoints
SET health_status = 'unknown'
WHERE id = '6a7eaf67-72e5-4f5d-8ecc-37a66dae8cd2'
  AND last_health_check_at IS NULL;
