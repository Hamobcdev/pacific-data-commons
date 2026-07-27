-- ============================================================================
-- Pacific Data Commons — Session 6 Migration (provenance field)
-- Synergy Blockchain Pacific (SBP)
--
-- Onboarding Step 5 (provenance declaration) needs somewhere durable to
-- store methodology, researcher names, ORCID/DOI verification results, and
-- peer review status. This is provider-level self-declared metadata, not a
-- new domain — it lives on `providers`, not a new table (spec explicitly
-- calls for this, and there is exactly one provenance declaration per
-- provider during the POC single-dataset onboarding flow).
-- ============================================================================

ALTER TABLE providers
ADD COLUMN IF NOT EXISTS provenance_declaration JSONB;
