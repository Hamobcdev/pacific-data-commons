-- ============================================================================
-- Session 38 — AML/KYC compliance stub
-- Authority: CLAUDE.md v2.2, Section 4 (P4 Security First) and the
-- Session 38 build prompt.
--
-- compliance_checks is the audit-trail table for every stub KYC verification
-- and AML transaction screening call (POST /compliance/kyc/verify and
-- POST /compliance/aml/screen-transaction in apps/directory-api). The live
-- engine does not exist yet — checked_by defaults to
-- 'sbp-compliance-stub-v1' and every current row is written by the stub —
-- but the schema is shaped for the real engine (Decision-register-style
-- forward compatibility, same posture as cultural_sovereignty_price_floor
-- in session17's endpoints migration) so no schema change is needed when
-- the live engine activates behind the CBS regulatory position (H1).
--
-- No provider, buyer, or public RLS policy exists on this table on purpose
-- — same "no anon/authenticated write (or read) path is added here on
-- purpose" posture as session37_deployment_invoices.sql's SBP-only fields
-- and session6_1_agent_schema.sql's attribution records. Service role
-- reads and writes all (the /compliance/* routes use the service role
-- client). A dedicated CBS read-only role is Session 39 work.
-- ============================================================================

CREATE TABLE compliance_checks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  check_type          TEXT NOT NULL
                      CHECK (check_type IN ('kyc', 'aml_transaction', 'sanctions')),

  entity_type         TEXT
                      CHECK (entity_type IN (
                        'provider', 'buyer', 'merchant', 'creator',
                        'grant_sponsor', 'transaction'
                      )),
  entity_id           UUID,
  wallet_address      TEXT,
  wallet_to           TEXT,
  platform_node       TEXT,
  transaction_type    TEXT,
  amount_usdc         NUMERIC,

  status              TEXT NOT NULL DEFAULT 'stub'
                      CHECK (status IN (
                        'stub', 'pending', 'cleared',
                        'flagged', 'rejected', 'cbs_review'
                      )),
  risk_level          TEXT DEFAULT 'standard'
                      CHECK (risk_level IN ('low', 'standard', 'high', 'critical')),
  risk_score          INTEGER DEFAULT 0,
  flags               JSONB DEFAULT '[]',
  fatf_applicable     BOOLEAN DEFAULT FALSE,
  pep_check           TEXT DEFAULT 'stub_clear',
  sanctions_check     TEXT DEFAULT 'stub_clear',
  screening_reference TEXT UNIQUE,

  checked_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  checked_by          TEXT DEFAULT 'sbp-compliance-stub-v1',

  cbs_reviewed        BOOLEAN DEFAULT FALSE,
  cbs_reviewed_at     TIMESTAMP WITH TIME ZONE,
  cbs_reviewer_note   TEXT,

  notes               TEXT
);

ALTER TABLE compliance_checks ENABLE ROW LEVEL SECURITY;

-- NO provider or buyer read access to compliance records
-- Service role reads and writes all (compliance routes use service role)
-- CBS dashboard (Session 39) will read via a dedicated read-only role

CREATE INDEX idx_compliance_wallet ON compliance_checks(wallet_address);
CREATE INDEX idx_compliance_node ON compliance_checks(platform_node);
CREATE INDEX idx_compliance_status ON compliance_checks(status)
  WHERE status NOT IN ('stub', 'cleared');
CREATE INDEX idx_compliance_flagged ON compliance_checks(cbs_reviewed)
  WHERE status = 'flagged' AND cbs_reviewed = FALSE;

-- ── VERIFICATION QUERIES ────────────────────────────────────────
-- Run after applying this migration to confirm correctness.

-- Confirm table exists
-- SELECT tablename FROM pg_tables WHERE tablename = 'compliance_checks';

-- Confirm RLS enabled
-- SELECT rowsecurity FROM pg_tables WHERE tablename = 'compliance_checks';
-- Expected: true

-- Confirm no public/authenticated policy exists (service-role-only by design)
-- SELECT policyname FROM pg_policies WHERE tablename = 'compliance_checks';
-- Expected: zero rows
