-- Migration 12: pdc_corridor_rates_constraints
-- Adds fetched_at tracking column and the unique constraint needed for
-- proper upserts on pdc_corridor_rates. Migration 12, 2026-10-21.

-- 1. Add fetched_at column (tracks when the row was inserted from its source)
ALTER TABLE public.pdc_corridor_rates
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ DEFAULT now();

-- 2. Backfill existing rows with created_at value as a proxy
UPDATE public.pdc_corridor_rates
  SET fetched_at = created_at
  WHERE fetched_at IS NULL;

-- 3. Add unique constraint to enable proper upserts and prevent duplicates
ALTER TABLE public.pdc_corridor_rates
  ADD CONSTRAINT uq_corridor_rates_key
  UNIQUE (currency_id, period_date, granularity, source_series_id);

-- Include the standard comment
COMMENT ON COLUMN public.pdc_corridor_rates.fetched_at IS
  'Timestamp when this row was fetched from its upstream source. Distinct from
   created_at (DB insert time). Enables backtesting and vintage-aware queries.';
