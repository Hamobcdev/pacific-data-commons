-- Migration 11: pdc_commodity_indices
-- Pacific commodity price history. Context layer for currency movement analysis.
-- Migration 11, 2026-10-21.

CREATE TYPE public.pdc_commodity AS ENUM (
  'copra',
  'coconut_oil',
  'sugar',
  'tuna',
  'crude_oil',
  'gold',
  'kava',
  'timber',
  'coffee'
);

CREATE TABLE public.pdc_commodity_indices (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commodity                public.pdc_commodity NOT NULL,
  period_date              DATE NOT NULL,
  price_usd                NUMERIC(18,4) NOT NULL,
  price_unit                TEXT NOT NULL,
  primary_pacific_producer CHAR(2),
  granularity              public.pdc_rate_granularity NOT NULL DEFAULT 'monthly_average',
  source_attribution       TEXT NOT NULL,
  notes                    TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commodity, period_date)
);

COMMENT ON TABLE public.pdc_commodity_indices IS
  'Pacific commodity price history. Copra/coconut oil: Samoa, Vanuatu, Solomon Islands. Sugar: Fiji. Tuna: all Pacific (WCPFC catch area). Crude oil: import cost driver for all Pacific nations. Kava: Vanuatu primary exporter. Gold: PNG (Porgera). Timber: Solomon Islands, PNG. Coffee: PNG highlands. Migration 11, 2026-10-21.';

-- RLS (CLAUDE.md P4 — enabled on every table from day one).
-- Reference data: publicly readable. Writes are service_role only (ingestion
-- pipeline) — service_role bypasses RLS regardless of policy coverage.
ALTER TABLE public.pdc_commodity_indices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdc_commodity_indices_public_read"
  ON public.pdc_commodity_indices
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.pdc_commodity_indices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_commodity_indices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_commodity_indices TO service_role;
