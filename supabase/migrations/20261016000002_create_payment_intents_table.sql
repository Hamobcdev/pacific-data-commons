-- Payment intents for the human "Run Query" payment rail (competition,
-- simplified flow — not full on-chain automation).
--
-- Tracks the lifecycle of a manual QR payment from intent creation
-- (email + reference ID captured before the QR is shown) through
-- on-chain verification to one-time download token issuance and
-- redemption. transactions_log (session1_migration.sql) is the wrong
-- home for this: it has no email, reference_id, download_token, or
-- state columns, and models a single completed query event rather than
-- a multi-step pending -> verified -> token workflow.
--
-- No RLS policies beyond enabling RLS — the Worker and apps/web API
-- routes both talk to this table exclusively via their Supabase
-- service-role clients (bypasses RLS by design, same posture as every
-- other service-role table in this schema). No anon/authenticated
-- policy is added deliberately: there is no legitimate browser-direct
-- access path to this table.
--
-- NOT auto-applied — SUPABASE WRITE APPROVAL REQUEST. Apply manually via
-- Supabase MCP or the dashboard SQL Editor after Anthony confirms.

CREATE TABLE payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id TEXT UNIQUE NOT NULL,
  endpoint_id UUID REFERENCES endpoints(id),
  tier_path TEXT NOT NULL,
  amount_usdc NUMERIC(10,6) NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_wallet_address TEXT,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','tx_submitted','verified','token_issued','token_redeemed')),
  algo_tx_id TEXT,
  download_token TEXT UNIQUE,
  token_issued_at TIMESTAMPTZ,
  token_redeemed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
    DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_intents_reference_id
  ON payment_intents(reference_id);
CREATE INDEX idx_payment_intents_download_token
  ON payment_intents(download_token);
CREATE INDEX idx_payment_intents_state
  ON payment_intents(state);

-- RLS
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
-- No public access — Worker and apps/web API routes use the service role key only.
