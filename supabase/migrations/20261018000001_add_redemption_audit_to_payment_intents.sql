-- Redemption audit fields for payment_intents (feat/modal-download-button).
--
-- Adds who/when metadata captured at the moment a download token is
-- actually redeemed (apps/web's data/download page), separate from the
-- existing token_redeemed_at lifecycle timestamp set by the same update.
--
-- NOT auto-applied — SUPABASE WRITE APPROVAL REQUEST. Apply manually via
-- Supabase MCP or the dashboard SQL Editor after Anthony confirms.

ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS redeemed_ip TEXT,
  ADD COLUMN IF NOT EXISTS redeemed_user_agent TEXT;
