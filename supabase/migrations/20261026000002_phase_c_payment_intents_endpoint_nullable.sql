-- Phase C (Tourism Data Framework) — provider self-registration.
--
-- payment_intents.endpoint_id was NOT NULL because every prior intent was
-- created by the human "Run Query" rail against a specific endpoint. The
-- $10 registration-fee intent has no endpoint — it pays for a provider
-- listing, not a data query — so endpoint_id must be nullable.
--
-- /payment/verify (apps/directory-api/src/routes/payment.ts) never reads
-- endpoint_id, so this is safe for the existing rail with no Worker change.
--
-- APPLIED via Supabase MCP (mcp__claude_ai_Supabase__apply_migration) on
-- 2026-10-26, same session, after explicit approval. This file documents
-- the already-applied change for repo/DB parity.

ALTER TABLE payment_intents ALTER COLUMN endpoint_id DROP NOT NULL;
