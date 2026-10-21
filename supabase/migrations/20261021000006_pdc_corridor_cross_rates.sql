-- Migration 06: pdc_corridor_cross_rates
-- Derived remittance corridor pairs (NZD/WST, AUD/WST, NZD/FJD, AUD/TOP, etc.)
-- with purchasing power calculations per remittance amount.
-- Migration 06, 2026-10-21.

CREATE TABLE public.pdc_corridor_cross_rates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency_id        UUID NOT NULL REFERENCES public.pdc_currencies(id),
  to_currency_id          UUID NOT NULL REFERENCES public.pdc_currencies(id),
  corridor                TEXT NOT NULL,
  period_date             DATE NOT NULL,
  granularity             public.pdc_rate_granularity NOT NULL,
  rate                    NUMERIC(20,10) NOT NULL,
  remittance_100          NUMERIC(20,10),
  remittance_500          NUMERIC(20,10),
  remittance_1000         NUMERIC(20,10),
  purchasing_power_index  NUMERIC(10,4),
  derived_from            TEXT,
  source_rate_ids         UUID[],
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_currency_id, to_currency_id, period_date, granularity)
);

COMMENT ON TABLE public.pdc_corridor_cross_rates IS
  'Derived remittance corridor cross-rates. Calculated from pdc_corridor_rates base pairs. purchasing_power_index baseline: 1990=100. remittance_100/500/1000 = value of that USD amount in destination currency at this rate. Migration 06, 2026-10-21.';

-- RLS (CLAUDE.md P4 — enabled on every table from day one).
-- Reference data: publicly readable. Writes are service_role only (ingestion
-- pipeline) — service_role bypasses RLS regardless of policy coverage.
ALTER TABLE public.pdc_corridor_cross_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdc_corridor_cross_rates_public_read"
  ON public.pdc_corridor_cross_rates
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.pdc_corridor_cross_rates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_corridor_cross_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_corridor_cross_rates TO service_role;
