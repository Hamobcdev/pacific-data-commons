-- ============================================================================
-- PDQE Stage 01 — Migration 2 of 4
-- pdqe.sources — Source Registry
--
-- A SOURCE records where information originated.
-- A source is NOT automatically a dataset.
-- Every PDQE dataset traces back to exactly one source.
--
-- Reference: PDQE_MASTER_BUILD.md, Stage 01, stages/01-source-registry.md
-- Depends on: 20261008000001_pdqe_schema_and_roles.sql
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-08
-- ============================================================================

-- ── 1. Domain enumeration ────────────────────────────────────────────────────

CREATE TYPE pdqe.source_domain AS ENUM (
  'FISHERIES',
  'CLIMATE',
  'TRADE',
  'AGRICULTURE',
  'OCEAN',
  'ENVIRONMENT',
  'ECONOMICS',
  'GOVERNANCE',
  'HEALTH',
  'OTHER'
);

COMMENT ON TYPE pdqe.source_domain IS
  'Data domain classification for a PDQE source.
   Matches the Jev Choice categories defined in Stage 04.
   NONE_OF_THE_ABOVE maps to OTHER at the Jev→DB boundary.';

-- ── 2. Licence status enumeration ────────────────────────────────────────────
-- UNKNOWN is not approval — "Unknown is not approval" (PDQE non-negotiable).
-- A source with UNKNOWN licence_status cannot advance past LICENSE_CHECKED.

CREATE TYPE pdqe.licence_status AS ENUM (
  'UNKNOWN',       -- default; pipeline halts at LICENSE_CHECKED; NOT approval
  'CLEAR',         -- confirmed open licence (CC, OGL, public domain, etc.)
  'REVIEW_REQUIRED', -- use permitted under specific conditions; needs human sign-off
  'RESTRICTED',    -- use is permitted but conditioned (attribution, non-commercial)
  'EXCLUDED'       -- must never be used; permanent; includes customary rights data
);

COMMENT ON TYPE pdqe.licence_status IS
  'Licence status for a PDQE source.
   UNKNOWN is the default and does NOT permit pipeline advancement.
   EXCLUDED is permanent and irreversible — see PDQE non-negotiables.
   "Unknown is not approval." — PDQE_MASTER_BUILD.md';

-- ── 3. Acquisition method enumeration ────────────────────────────────────────

CREATE TYPE pdqe.acquisition_method AS ENUM (
  'MANUAL_UPLOAD',      -- PDF/file uploaded by SBP operator
  'API_PULL',           -- fetched from a public API
  'WEB_SCRAPE',         -- scraped from a public web page (approved sources only)
  'DIRECT_PROVISION',   -- provided directly by the publishing institution
  'PARTNER_FEED'        -- delivered via a formal data-sharing agreement
);

-- ── 4. Source type enumeration ────────────────────────────────────────────────

CREATE TYPE pdqe.source_type AS ENUM (
  'PDF_DOCUMENT',       -- static PDF (annual reports, bulletins, research papers)
  'API_ENDPOINT',       -- live API (REST, JSON feed)
  'SPREADSHEET',        -- CSV, XLSX, or similar tabular file
  'WEB_PAGE',           -- HTML page with structured data
  'DATABASE_EXPORT',    -- structured export from an institutional database
  'OTHER'
);

-- ── 5. pdqe.sources table ─────────────────────────────────────────────────────

CREATE TABLE pdqe.sources (
  -- Primary key
  source_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  title                 TEXT NOT NULL
                        CHECK (char_length(trim(title)) >= 3),
  description           TEXT,
  publisher_name        TEXT NOT NULL
                        CHECK (char_length(trim(publisher_name)) >= 2),
  publisher_url         TEXT,
  source_url            TEXT,                    -- canonical URL; NULL for manual uploads
  source_type           pdqe.source_type NOT NULL,
  acquisition_method    pdqe.acquisition_method NOT NULL,

  -- Licence
  licence_status        pdqe.licence_status NOT NULL DEFAULT 'UNKNOWN',
  licence_text          TEXT,                    -- extracted licence statement or URL
  licence_url           TEXT,                    -- direct link to licence document
  licence_confirmed_by  UUID REFERENCES auth.users(id),  -- auth.uid() of reviewer
  licence_confirmed_at  TIMESTAMPTZ,

  -- Scope
  geographic_scope      TEXT[] NOT NULL DEFAULT '{}',
                        -- ISO 3166-1 alpha-3 country codes, or 'PACIFIC' / 'GLOBAL'
  candidate_domains     pdqe.source_domain[] NOT NULL DEFAULT '{}',
                        -- one or more candidate domains (Jev resolves to primary)

  -- Timestamps
  discovered_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  accessed_at           TIMESTAMPTZ,             -- last time the source was fetched
  published_at          TIMESTAMPTZ,             -- date the source was originally published

  -- Pipeline
  lifecycle_state       TEXT NOT NULL DEFAULT 'DISCOVERED'
                        CHECK (lifecycle_state IN (
                          'DISCOVERED',
                          'SOURCE_REGISTERED',
                          'LICENSE_CHECKED',
                          'INGESTED',
                          'EXTRACTED',
                          'CLASSIFIED',
                          'QUALIFIED',
                          'VALIDATED',
                          'REVIEW',
                          'APPROVED',
                          'DATASET_CREATED',
                          'COLLECTION_LINKED',
                          'ENDPOINT_GENERATED',
                          'ENDPOINT_VALIDATED',
                          'PROVIDER_APPROVED',
                          'PUBLISHED',
                          'x402_QUERYABLE',
                          'REJECTED',
                          'QUARANTINED'
                        )),

  -- Provenance
  registered_by         UUID NOT NULL REFERENCES auth.users(id),
  notes                 TEXT,

  -- Internal bypass flag (OD-4 — RESOLVED)
  -- TRUE = SBP internal pipeline; $25 upload fee does not apply.
  -- FALSE (default) = external provider path (Stage 11).
  internal_pipeline     BOOLEAN NOT NULL DEFAULT TRUE,

  -- Deduplication
  -- SHA-256 hash of the source content (set at ingestion time).
  -- NULL until INGESTED state.
  content_hash          TEXT,

  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate content from re-entering the pipeline
CREATE UNIQUE INDEX idx_pdqe_sources_content_hash
  ON pdqe.sources (content_hash)
  WHERE content_hash IS NOT NULL;

-- Fast lookups by lifecycle state (pipeline management queries)
CREATE INDEX idx_pdqe_sources_lifecycle_state
  ON pdqe.sources (lifecycle_state);

-- Fast lookups by publisher
CREATE INDEX idx_pdqe_sources_publisher
  ON pdqe.sources (publisher_name);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION pdqe.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdqe_sources_updated_at
  BEFORE UPDATE ON pdqe.sources
  FOR EACH ROW EXECUTE FUNCTION pdqe.set_updated_at();

COMMENT ON TABLE pdqe.sources IS
  'PDQE Source Registry — records where information originated.
   A source is not automatically a dataset.
   Every downstream PDQE object (extraction, dataset, endpoint) traces
   to exactly one source via source_id.
   EXCLUDED licence_status is permanent and irreversible.
   UNKNOWN licence_status does not permit pipeline advancement.
   "Unknown is not approval." — PDQE_MASTER_BUILD.md.';

COMMENT ON COLUMN pdqe.sources.lifecycle_state IS
  'Current position in the 19-state PDQE lifecycle (17 active + REJECTED + QUARANTINED).
   State transitions are enforced by deterministic code only — not ad-hoc SQL.
   See pdqe.pipeline_state for the full transition log.';

COMMENT ON COLUMN pdqe.sources.content_hash IS
  'SHA-256 of source content. Set at INGESTED state.
   Unique constraint prevents duplicate content re-entering the pipeline.
   NULL until ingestion completes.';

COMMENT ON COLUMN pdqe.sources.internal_pipeline IS
  'TRUE = SBP internal bypass; $25 upload fee does not apply (OD-4).
   FALSE = external provider path, active at Stage 11.
   Default TRUE for all sources created in Stages 01–10.';

COMMENT ON COLUMN pdqe.sources.licence_status IS
  'UNKNOWN is NOT approval. EXCLUDED is permanent and irreversible.
   Customary land and traditional fishing rights data is always EXCLUDED.
   Any data covered by bilateral donor confidentiality is always EXCLUDED.';

-- ── 6. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE pdqe.sources ENABLE ROW LEVEL SECURITY;

-- pdqe_admin: full access
CREATE POLICY "pdqe_admin_all_sources"
  ON pdqe.sources
  FOR ALL
  TO pdqe_admin
  USING (true)
  WITH CHECK (true);

-- pdqe_reviewer: read-only access (they work from pdqe.pipeline_state and audit_log)
CREATE POLICY "pdqe_reviewer_read_sources"
  ON pdqe.sources
  FOR SELECT
  TO pdqe_reviewer
  USING (true);

-- pdqe_provider: read their own submissions only (Stage 11; internal_pipeline=false)
-- Locked to registered_by matching the current user.
CREATE POLICY "pdqe_provider_own_sources"
  ON pdqe.sources
  FOR SELECT
  TO pdqe_provider
  USING (registered_by = auth.uid() AND internal_pipeline = false);

-- pdqe_reader: no access to sources table (read published endpoint metadata only)
-- (No policy = deny by default under RLS)

-- authenticated: pdqe_admin-mapped users (role resolved via application layer)
-- authenticated users' access is governed by their application-level pdqe role.
-- Until the role-mapping table exists (Stage 02+), no direct authenticated access.

-- service_role: full bypass (Supabase default; used by server-side pipeline code)
CREATE POLICY "service_role_all_sources"
  ON pdqe.sources
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 7. Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON pdqe.sources TO pdqe_admin;
GRANT SELECT ON pdqe.sources TO pdqe_reviewer;
GRANT SELECT ON pdqe.sources TO pdqe_provider;
GRANT ALL ON pdqe.sources TO service_role;
