-- Founding partner free tier (Decision 27 extended — 3 datasets free)
-- Anthony manually sets founding_partner = true for named pilot partners
-- Cold inbound submissions are never founding partners (Decision 58)

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS founding_partner BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS founding_partner_set_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS founding_partner_note TEXT,
  -- Track pipeline datasets used to enforce the 3-free limit
  ADD COLUMN IF NOT EXISTS pipeline_datasets_used INTEGER DEFAULT 0,
  -- Founding partner free dataset limit (default 3 per policy)
  ADD COLUMN IF NOT EXISTS founding_partner_free_limit INTEGER DEFAULT 3;

-- Set SBP test provider as founding partner immediately
-- Provider ID confirmed: 23688689-502a-437d-939b-3288d8292534
--
-- pipeline_datasets_used = 0 (not 3): the earlier seed here counted the
-- research working papers against this account's quota, which correctly
-- reflected real prior usage but meant this account could never show
-- FoundingPartnerWelcome — it was permanently at its 3/3 limit. Reset to 0
-- so the founding-partner welcome panel (not the $25 gate) is what's on
-- screen for demos/testing, which is the actual purpose of this account.
UPDATE providers
SET
  founding_partner = TRUE,
  founding_partner_set_at = NOW(),
  founding_partner_note = 'SBP pilot test account — founding partner',
  pipeline_datasets_used = 0
WHERE id = '23688689-502a-437d-939b-3288d8292534';

COMMENT ON COLUMN providers.founding_partner IS
  'Manually set by SBP admin. Grants free pipeline processing up to founding_partner_free_limit datasets. Decision 27 extended. Cold inbound uploads excluded per Decision 58.';

COMMENT ON COLUMN providers.pipeline_datasets_used IS
  'Count of datasets processed through paid or free pipeline. Incremented on each formatting run approval. Used to enforce founding_partner_free_limit.';
