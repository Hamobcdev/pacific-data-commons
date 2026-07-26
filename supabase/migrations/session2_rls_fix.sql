-- ============================================================================
-- Pacific Data Commons — Session 2 Migration (RLS fix)
-- Synergy Blockchain Pacific (SBP)
--
-- Bug found while building the Directory API (Component 1): the Session 1
-- endpoints_public_read policy required sensitivity_level = 'public', but
-- sensitivity_level is documented (session1_migration.sql, endpoints table)
-- as "government track only — NULL for international". Every plain
-- international provider endpoint therefore has sensitivity_level = NULL and
-- was invisible to anon-key reads under the original policy — a false
-- negative, not a false positive, so it never surfaced as a security issue,
-- only as "the anon key can't see any PDC international endpoint".
--
-- The Directory API itself is unaffected (it runs on the service-role key
-- and enforces PDC-layer visibility rules in its own service layer — see
-- apps/directory-api/src/services/searchService.ts), but any other client
-- reading Supabase directly with the anon key hit this. Fixed here so the
-- RLS policy matches the same commercial-eligibility rule the Directory API
-- already applies: public/unclassified sensitivity, and either no
-- government-track commercial classification or explicitly fully_commercial.
-- ============================================================================

DROP POLICY IF EXISTS endpoints_public_read ON endpoints;

CREATE POLICY endpoints_public_read ON endpoints
  FOR SELECT TO anon
  USING (
    is_active = TRUE
    AND (sensitivity_level IS NULL OR sensitivity_level = 'public')
    AND (commercial_eligibility IS NULL OR commercial_eligibility = 'fully_commercial')
  );
