-- Prevent the same Algorand transaction ID from being used to redeem
-- multiple payment intents.
-- Existing rows: algo_tx_id is nullable so the unique constraint
-- allows multiple NULLs (standard SQL behaviour).
--
-- NOT auto-applied — SUPABASE WRITE APPROVAL REQUEST. Apply manually via
-- Supabase MCP or the dashboard SQL Editor after Anthony confirms. If any
-- existing rows already share a non-null algo_tx_id, this ALTER TABLE will
-- fail — check for that before applying:
--   SELECT algo_tx_id, count(*) FROM payment_intents
--   WHERE algo_tx_id IS NOT NULL GROUP BY algo_tx_id HAVING count(*) > 1;
--
-- Filename note: picked 20261020000002 rather than 20261020000001 — that
-- prefix is already used by this same day's
-- 20261020000001_fix_pricing_tiers_human_deliverable_sync.sql.

ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_algo_tx_id_unique UNIQUE (algo_tx_id);
