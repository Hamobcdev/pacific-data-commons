-- Migration 04: pdc_currencies
-- Master currency registry for Pacific FX Oracle. Keystone table — all other
-- oracle tables FK to this. Migration 04, 2026-10-21.

CREATE TYPE public.pdc_currency_type AS ENUM (
  'ANCHOR',           -- USD, AUD, NZD, EUR, JPY, CNY, SGD
  'REGIONAL_PACIFIC', -- WST, FJD, TOP, PGK, SBD, VUV
  'TRADE_PARTNER',    -- CHN, SGP majors
  'COMPARATIVE_RSE',  -- PHP — outside Pacific but analogous migration corridor
  'HISTORICAL',       -- Pre-independence/colonial currencies (GBP, AUD under colonial use)
  'DOLLARISED',       -- Nations using USD/AUD/NZD as official currency
  'PEGGED'            -- Currencies with formal USD/AUD/NZD peg
);

CREATE TABLE public.pdc_currencies (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_code                    CHAR(3) NOT NULL UNIQUE,
  iso_numeric                 CHAR(3),
  currency_name               TEXT NOT NULL,
  country_name                TEXT NOT NULL,
  country_iso2                CHAR(2),
  country_iso3                CHAR(3),
  currency_tier               INT NOT NULL CHECK (currency_tier BETWEEN 1 AND 4),
  currency_type               public.pdc_currency_type NOT NULL,
  basket_composition          JSONB,
  monetary_independence_date  DATE,
  predecessor_currency        CHAR(3),
  current_central_bank        TEXT,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.pdc_currencies IS
  'Master currency registry for Pacific FX Oracle. Keystone table — all other oracle tables FK to this. Includes active, historical, pegged, and dollarised currencies. PHP classified as COMPARATIVE_RSE (analogous RSE corridor, outside Pacific Island region). Migration 04, 2026-10-21.';

COMMENT ON COLUMN public.pdc_currencies.currency_tier IS
  'Tier 1: anchor/major (USD,AUD,NZD). Tier 2: regional Pacific (WST,FJD,TOP,PGK,SBD,VUV). Tier 3: trade partners (CNY,SGD,EUR,JPY). Tier 4: historical/dollarised/pegged.';

COMMENT ON COLUMN public.pdc_currencies.basket_composition IS
  'JSONB only for basket-peg currencies (e.g. WST). Format: {"USD":0.45,"NZD":0.30,"AUD":0.15,"EUR":0.07,"JPY":0.03}. NULL for floating or dollarised currencies.';

-- RLS (CLAUDE.md P4 — enabled on every table from day one).
-- Reference data: publicly readable. Writes are service_role only (ingestion
-- pipeline) — service_role carries BYPASSRLS in Supabase and is unaffected
-- by the absence of a write policy here.
ALTER TABLE public.pdc_currencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdc_currencies_public_read"
  ON public.pdc_currencies
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.pdc_currencies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_currencies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdc_currencies TO service_role;
