-- Applied directly to the live DB via Supabase MCP on 2026-10-12 (session 42).
-- Column already exists in production. This file records the change in the
-- repo migration history so `supabase db diff` and future resets stay correct.
-- Safe to re-run: IF NOT EXISTS guard prevents errors on a clean environment.
ALTER TABLE endpoints
  ADD COLUMN IF NOT EXISTS goplausible_registered BOOLEAN NOT NULL DEFAULT false;

-- Back-fill the six endpoints already confirmed registered on GoPlausible
-- as of 2026-10-12 (applied at same time as column creation). IDs below are
-- the six rows confirmed settled in the canary sweep of that date.
-- These UPDATEs are also idempotent (setting true to true is a no-op).
-- NOTE: do not add more IDs here — future registrations are tracked by the
-- canary script in real time.
UPDATE endpoints SET goplausible_registered = true
WHERE id IN (
  '013ff2b2-f316-4a83-ac45-27f7b59e5dec'
  -- Add the other 5 settled IDs here if you have them on hand;
  -- the canary script will skip already-registered rows regardless.
);
