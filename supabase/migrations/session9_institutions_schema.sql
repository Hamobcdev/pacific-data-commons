-- ============================================================================
-- Pacific Data Commons — Session 9 Migration
-- Multi-faculty institution model + onboarding ownership security fix
-- Authority: CLAUDE.md v2.2, PDC Frontend Audit Report (2026-08-03)
-- ============================================================================

-- ── 1. INSTITUTIONS TABLE ───────────────────────────────────
-- One record per institution, many providers (faculties/departments) per
-- institution. Linked by verified domain match at registration time — no
-- approval step required (auto-link).
CREATE TABLE IF NOT EXISTS institutions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_name      TEXT NOT NULL,
  verified_domain       TEXT NOT NULL UNIQUE,
  -- The DNS-verified domain (e.g. usp.ac.fj) — UNIQUE ensures one
  -- institution record per domain, which is how later providers auto-link.
  institution_type      TEXT NOT NULL CHECK (institution_type IN (
                          'university',
                          'government',
                          'ngo',
                          'private',
                          'cultural',
                          'intergovernmental'
                        )),
  -- Matches providers.institution_type's existing check constraint values
  -- (session1_migration.sql) rather than the illustrative list in the
  -- Session 9 brief, so provider -> institution linkage never disagrees on
  -- valid types.
  country               TEXT NOT NULL,
  official_website      TEXT NOT NULL,

  -- Verification status
  verification_status   TEXT NOT NULL DEFAULT 'pending'
                        CHECK (verification_status IN (
                          'pending',
                          'verified',
                          'suspended'
                        )),
  verified_at           TIMESTAMP WITH TIME ZONE,

  -- Directory display
  logo_url              TEXT,
  description           TEXT,

  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER institutions_updated_at
  BEFORE UPDATE ON institutions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. LINK PROVIDERS TO INSTITUTIONS ──────────────────────
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id),
  ADD COLUMN IF NOT EXISTS faculty_name TEXT,
  -- e.g. "School of Marine Studies" under USP
  ADD COLUMN IF NOT EXISTS faculty_contact_email TEXT;
  -- The verified faculty contact email (may differ from a shared
  -- institution-level address)

CREATE INDEX IF NOT EXISTS idx_providers_institution
  ON providers(institution_id);

-- ── 3. ONBOARDING SESSION TOKEN (C1 fix) ───────────────────
-- Closes the provider-record hijack gap: register.ts previously returned a
-- real providerId to anyone who typed a matching contact_email, and every
-- downstream onboarding action trusted that providerId with zero further
-- verification. Every mutating onboarding action now requires the matching
-- session token minted at Step 1 (see lib/onboarding/session.ts).
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS onboarding_session_token TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_session_expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_providers_session_token
  ON providers(onboarding_session_token)
  WHERE onboarding_session_token IS NOT NULL;

-- ── 4. RLS POLICIES ─────────────────────────────────────────
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

-- Public read — institution profiles are public directory information
CREATE POLICY institutions_public_read ON institutions
  FOR SELECT TO anon, authenticated
  USING (TRUE);

-- No client-side insert/update/delete policy is defined — institutions are
-- only ever written by register.ts via the service-role client (RLS is
-- bypassed for that role by Supabase default behaviour, same pattern as
-- every other write path in session1_migration.sql). This deliberately
-- leaves no anon/authenticated write policy on the table.
