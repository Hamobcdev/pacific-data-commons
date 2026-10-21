-- Migration 05: pdc_corridor_rates
-- Append-only rate time-series. Incorporates probe findings 1 and 2
-- (docs/intelligence/oracle-api-structure-probe-2026-10-21.md):
--   1. base_currency + quote_currency are explicit — rate direction is never implicit.
--   2. granularity distinguishes World Bank annual_average rows from FRED daily_spot rows.
-- Migration 05, 2026-10-21.

CREATE TYPE public.pdc_rate_granularity AS ENUM (
  'daily_spot',
  'monthly_average',
  'annual_average'
);

CREATE TYPE public.pdc_data_type AS ENUM (
  'sourced',   -- directly from a primary source API
  'derived',   -- calculated from sourced rates
  'pegged',    -- rate fixed by central bank or monetary arrangement
  'estimated'  -- Comtrade/WB secondary estimate, not self-reported
);

CREATE TABLE public.pdc_corridor_rates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_id           UUID NOT NULL REFERENCES public.pdc_currencies(id),
  base_currency         CHAR(3) NOT NULL,
  quote_currency        CHAR(3) NOT NULL,
  period_date           DATE NOT NULL,
  granularity           public.pdc_rate_granularity NOT NULL,
  rate_value            NUMERIC(20,10) NOT NULL,
  rate_high             NUMERIC(20,10),
  rate_low              NUMERIC(20,10),
  data_type             public.pdc_data_type NOT NULL DEFAULT 'sourced',
  source_attribution    TEXT NOT NULL,
  source_series_id      TEXT,
  methodology_notes     TEXT,
  peg_reference_currency CHAR(3),
  is_verified           BOOLEAN NOT NULL DEFAULT false,
  is_superseded         BOOLEAN NOT NULL DEFAULT false,
  oracle_version        TEXT NOT NULL DEFAULT 'v1.0',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_corridor_rates_currency_date
  ON public.pdc_corridor_rates(currency_id, period_date DESC);

CREATE INDEX idx_corridor_rates_base_quote
  ON public.pdc_corridor_rates(base_currency, quote_currency, period_date DESC);

CREATE INDEX idx_corridor_rates_live
  ON public.pdc_corridor_rates(currency_id, period_date DESC)
  WHERE is_superseded = false;

COMMENT ON TABLE public.pdc_corridor_rates IS
  'Append-only rate time-series. Never UPDATE rows — corrections insert new row and set is_superseded=true on prior. base_currency/quote_currency carry explicit rate direction. rate_value is units of base_currency per 1 quote_currency (e.g. base=WST, quote=USD, value=2.75). World Bank PA.NUS.FCRF rows stored as annual_average with period_date=year-end. FRED DEXUSAL rows stored as daily_spot, inverted from USD/AUD to AUD/USD at ingest. Migration 05, 2026-10-21.';

COMMENT ON COLUMN public.pdc_corridor_rates.rate_value IS
  'Units of base_currency per 1 quote_currency. Convention: base=local currency, quote=USD. FRED rates (originally USD/AUD) are inverted at ingest (1 ÷ DEXUSAL) so all rows share this convention.';

-- RLS (CLAUDE.md P4 — enabled on every table from day one).
-- Reference data: publicly readable. Writes are service_role only (ingestion
-- pipeline) — this table is append-only by convention; application code,
-- not RLS, enforces the no-UPDATE rule since service_role bypasses RLS.
ALTER TABLE public.pdc_corridor_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdc_corridor_rates_public_read"
  ON public.pdc_corridor_rates
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.pdc_corridor_rates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_corridor_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_corridor_rates TO service_role;
