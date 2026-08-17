-- Session 23 (Deliverable 3B, Decision 58 / P12): pre-upload fee gate for
-- cold inbound dataset uploads. $25 USDC per dataset, no free tier, paid
-- BEFORE the upload UI is shown — both resource cost recovery and an
-- accountability mechanism tracing malicious submissions to a wallet or
-- invoice identity.
--
-- Distinct from the existing formatting_runs.fee_amount_usdc /
-- fee_waived / fee_charged columns (session1_migration.sql): those track
-- Decision 27's pipeline fee, charged AFTER a provider approves the
-- formatted output, with the first dataset free — and per Decision 58's
-- revision, that waiver now applies only to SBP's own pipeline service for
-- already-verified providers. upload_payments is the new, separate
-- pre-upload gate for cold inbound submissions (new or returning provider
-- uploading through onboarding's /upload step): never waived, checked
-- before any file lands in Supabase Storage at all.
--
-- dataset_slot stores the provider's onboarding_session_token (minted
-- fresh per dataset cycle by both register.ts and start-new-dataset.ts —
-- see lib/onboarding/session.ts) rather than inventing a new slot concept:
-- one session token already corresponds to exactly one upload cycle.
--
-- This migration does NOT wire real wallet-signing or automatic on-chain
-- verification — algo_tx_id is a provider-submitted claim, confirmed
-- manually (Supabase dashboard / follow-up session) against the chain
-- before payment_status flips to 'confirmed'. See UploadPaymentGate.tsx's
-- doc comment.

CREATE TABLE IF NOT EXISTS upload_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID REFERENCES providers(id) ON DELETE CASCADE,
  amount_usdc     DECIMAL NOT NULL DEFAULT 25.00,
  algo_tx_id      TEXT,           -- provider-submitted claim, manually verified on-chain
  payment_method  TEXT CHECK (payment_method IN ('usdc', 'stripe', 'invoice')),
  payment_status  TEXT CHECK (payment_status IN ('pending', 'confirmed', 'failed')) DEFAULT 'pending',
  dataset_slot    TEXT NOT NULL,  -- provider's onboarding_session_token for this dataset cycle
  pdf_surcharge   BOOLEAN DEFAULT FALSE,  -- +$10 for scanned PDFs
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  confirmed_at    TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_upload_payments_provider_slot
  ON upload_payments(provider_id, dataset_slot);

ALTER TABLE upload_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "providers_own_payments" ON upload_payments
  FOR SELECT TO authenticated
  USING (provider_id IN (
    SELECT id FROM providers WHERE contact_email = auth.email()
  ));

CREATE POLICY "service_role_upload_payments" ON upload_payments
  FOR ALL TO service_role USING (true);
