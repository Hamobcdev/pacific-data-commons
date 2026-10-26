-- Add 'bank_transfer' as a valid registration_payment_method value.
--
-- NOT YET APPLIED. SUPABASE WRITE APPROVAL REQUEST — awaiting approval
-- before this is run against poiiwcbriqwczmppoevd.
--
-- Context: apps/web's Phase C provider registration form
-- (components/registration/steps/Step4Payment.tsx) adds a Bank Transfer
-- option alongside USDC/Stripe. Bank transfer is never automatically
-- verified (no payment_intents row, no Stripe session) — registerProvider()
-- is never called for this path, so no insert against this column happens
-- yet for 'bank_transfer' from the current code change. This migration
-- only widens the constraint so a future manual/admin-confirmed insert
-- (once Anthony verifies the transfer by email) is not rejected.
--
-- Current constraint (confirmed live via pg_constraint on poiiwcbriqwczmppoevd):
--   tourism_providers_registration_payment_method_check
--   CHECK (registration_payment_method = ANY (ARRAY['usdc_algorand','stripe','waived']))

ALTER TABLE tourism_providers
  DROP CONSTRAINT tourism_providers_registration_payment_method_check;

ALTER TABLE tourism_providers
  ADD CONSTRAINT tourism_providers_registration_payment_method_check
  CHECK (registration_payment_method IN ('usdc_algorand', 'stripe', 'waived', 'bank_transfer'));
