-- Migration 08: pdc_rate_events
-- Junction table linking rate observations to events. Enables
-- "show all currencies impacted by Cyclone Winston" as a structured query.
-- Migration 08, 2026-10-21.

CREATE TYPE public.pdc_impact_direction AS ENUM (
  'positive',
  'negative',
  'neutral'
);

CREATE TABLE public.pdc_rate_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_id                 UUID NOT NULL REFERENCES public.pdc_corridor_rates(id),
  event_id                UUID NOT NULL REFERENCES public.pdc_events(id),
  impact_direction        public.pdc_impact_direction NOT NULL DEFAULT 'neutral',
  impact_magnitude_pct    NUMERIC(8,4),
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rate_id, event_id)
);

COMMENT ON TABLE public.pdc_rate_events IS
  'Junction: pdc_corridor_rates ↔ pdc_events. impact_magnitude_pct is signed (positive = currency appreciation, negative = depreciation). Migration 08, 2026-10-21.';

-- RLS (CLAUDE.md P4 — enabled on every table from day one).
-- Reference data: publicly readable. Writes are service_role only (curation
-- pipeline) — service_role bypasses RLS regardless of policy coverage.
ALTER TABLE public.pdc_rate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdc_rate_events_public_read"
  ON public.pdc_rate_events
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.pdc_rate_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_rate_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_rate_events TO service_role;
