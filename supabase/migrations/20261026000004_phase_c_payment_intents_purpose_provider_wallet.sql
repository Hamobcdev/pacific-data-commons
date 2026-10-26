-- Phase C — schema gaps found during build-prompt verification (not in the
-- original 3-migration brief; added after a schema audit surfaced them and
-- was approved before any code was written):
--
-- 1. payment_intents had no way to distinguish an endpoint-query intent from
--    a registration-fee intent, and no column to link a settled intent back
--    to the tourism_providers row it paid for. 'purpose' and 'provider_id'
--    add both. Backfill default 'endpoint_query' is correct for every
--    pre-existing row — they were all created by the human "Run Query" rail
--    before this column existed.
-- 2. tourism_providers had no generic wallet_address column — only
--    tiptide_wallet_address, an unrelated loyalty-wallet feature. Step 3's
--    "Algorand wallet address (for future x402 endpoint payments)" field
--    needed its own nullable column.
--
-- APPLIED via Supabase MCP on 2026-10-26, same session, after explicit
-- approval. This file documents the already-applied change for repo/DB
-- parity.

ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'endpoint_query'
    CHECK (purpose IN ('endpoint_query', 'registration_fee')),
  ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES tourism_providers(id) ON DELETE SET NULL;

ALTER TABLE tourism_providers
  ADD COLUMN IF NOT EXISTS wallet_address TEXT;
