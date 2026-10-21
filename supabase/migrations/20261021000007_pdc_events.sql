-- Migration 07: pdc_events
-- Human-curated economic and geopolitical event registry.
-- Migration 07, 2026-10-21.

CREATE TYPE public.pdc_event_category AS ENUM (
  'CYCLONE',
  'PANDEMIC',
  'POLITICAL',
  'MONETARY_POLICY',
  'COMMODITY_SHOCK',
  'REMITTANCE_DISRUPTION'
);

CREATE TABLE public.pdc_events (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code                      TEXT NOT NULL UNIQUE,
  event_name                      TEXT NOT NULL,
  event_category                  public.pdc_event_category NOT NULL,
  event_start_date                DATE NOT NULL,
  event_end_date                  DATE,
  affected_countries              CHAR(2)[],
  affected_currencies              CHAR(3)[],
  severity                        INT CHECK (severity BETWEEN 1 AND 5),
  description                     TEXT,
  source_citation                 TEXT,
  estimated_remittance_impact_pct NUMERIC(8,4),
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.pdc_events IS
  'Human-curated event registry. Events are their own queryable endpoint. event_code is the stable API identifier e.g. CYCLONE_WINSTON_2016, COVID_SHOCK_2020. severity 1=minor to 5=catastrophic. Migration 07, 2026-10-21.';

-- RLS (CLAUDE.md P4 — enabled on every table from day one).
-- Reference data: publicly readable. Writes are service_role only (curation
-- pipeline) — service_role bypasses RLS regardless of policy coverage.
ALTER TABLE public.pdc_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdc_events_public_read"
  ON public.pdc_events
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.pdc_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_events TO service_role;
