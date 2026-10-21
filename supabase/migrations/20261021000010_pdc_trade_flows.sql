-- Migration 10: pdc_trade_flows
-- Incorporates probe findings 4, 5, 6, 7, 8
-- (docs/intelligence/oracle-api-structure-probe-2026-10-21.md):
--   4. hs_description populated only when includeDesc=true is passed to Comtrade; nullable here.
--   5. Comtrade grossWgt of 0.0 means "not reported" — must be ingested as NULL, not a true zero.
--   6. trade_value_usd sourced from primaryValue only (Comtrade already resolves FOB/CIF by flow).
--   7. partnerCode=0 ("W00"/World) rows are valid aggregate totals, not junk — flagged via is_world_aggregate.
--   8. is_self_reported=false (Comtrade isReported field) means a Comtrade secondary estimate, not a government submission.
-- Migration 10, 2026-10-21.

CREATE TABLE public.pdc_trade_flows (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year           INT NOT NULL,
  reporter_iso3         CHAR(3) NOT NULL,
  partner_iso3          CHAR(3) NOT NULL,
  flow_type             CHAR(1) NOT NULL CHECK (flow_type IN ('X', 'M')),
  hs_code               TEXT NOT NULL,
  hs_description        TEXT,
  trade_value_usd       NUMERIC(18,2),
  quantity              NUMERIC(18,4),
  quantity_unit         TEXT,
  net_weight_kg         NUMERIC(18,4),
  is_world_aggregate    BOOLEAN NOT NULL DEFAULT false,
  is_self_reported      BOOLEAN NOT NULL DEFAULT true,
  is_quantity_estimated BOOLEAN NOT NULL DEFAULT false,
  source                TEXT NOT NULL DEFAULT 'un_comtrade_C_A_HS',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period_year, reporter_iso3, partner_iso3, flow_type, hs_code)
);

COMMENT ON TABLE public.pdc_trade_flows IS
  'Pacific trade flow data sourced from UN Comtrade API. trade_value_usd from primaryValue (FOB for exports, CIF for imports — Comtrade resolves this). partner_iso3 W00 = world aggregate (partnerCode=0) — a valid total row, not a sentinel. is_world_aggregate flags these rows. is_self_reported=false means figure is a Comtrade secondary estimate, not a government submission. grossWgt 0.0 treated as NULL at ingest. Always request includeDesc=true from Comtrade API. Migration 10, 2026-10-21.';

COMMENT ON COLUMN public.pdc_trade_flows.flow_type IS
  'X = export (FOB), M = import (CIF). Matches Comtrade flowCode.';

-- RLS (CLAUDE.md P4 — enabled on every table from day one).
-- Reference data: publicly readable. Writes are service_role only (ingestion
-- pipeline) — service_role bypasses RLS regardless of policy coverage.
ALTER TABLE public.pdc_trade_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdc_trade_flows_public_read"
  ON public.pdc_trade_flows
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.pdc_trade_flows TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_trade_flows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_trade_flows TO service_role;
