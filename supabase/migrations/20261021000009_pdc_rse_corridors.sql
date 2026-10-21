-- Migration 09: pdc_rse_corridors
-- RSE/SWP/PALM labour migration and remittance data by corridor and year.
-- Migration 09, 2026-10-21.

CREATE TYPE public.pdc_programme_type AS ENUM (
  'RSE',   -- NZ Recognised Seasonal Employer
  'SWP',   -- AU Seasonal Worker Programme (pre-PALM)
  'PALM'   -- AU Pacific Australia Labour Mobility (current)
);

CREATE TABLE public.pdc_rse_corridors (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year                      INT NOT NULL,
  source_country            CHAR(2) NOT NULL CHECK (source_country IN ('NZ', 'AU')),
  pacific_country           CHAR(2) NOT NULL,
  worker_count              INT,
  remittance_volume_usd     NUMERIC(18,2),
  avg_wage_usd              NUMERIC(12,2),
  programme_type            public.pdc_programme_type NOT NULL,
  agricultural_output_index NUMERIC(10,4),
  source_attribution        TEXT NOT NULL,
  notes                     TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, source_country, pacific_country, programme_type)
);

COMMENT ON TABLE public.pdc_rse_corridors IS
  'RSE/SWP/PALM labour migration and remittance data. Connects labour flow volumes to remittance volumes and currency demand. agricultural_output_index tracks inverse correlation (RSE departure → local farm labour drain → output decline). Primary sources: NZ Immigration annual RSE stats, DFAT PALM data, World Bank bilateral remittance matrix. Migration 09, 2026-10-21.';

-- RLS (CLAUDE.md P4 — enabled on every table from day one).
-- Reference data: publicly readable. Writes are service_role only (ingestion
-- pipeline) — service_role bypasses RLS regardless of policy coverage.
ALTER TABLE public.pdc_rse_corridors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdc_rse_corridors_public_read"
  ON public.pdc_rse_corridors
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.pdc_rse_corridors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_rse_corridors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_rse_corridors TO service_role;
