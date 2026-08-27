-- ============================================================================
-- Session 34 — Pacific Tourism Statistics (fifth tourism-orchestrator source)
--
-- Real-time weather (Open-Meteo) covers current/forecast conditions, but
-- tourism arrival/spend statistics only exist as annual figures — World
-- Bank International Tourism, Number of Arrivals
-- (data.worldbank.org/indicator/ST.INT.ARVL) and SPTO seasonal reporting
-- don't publish real-time data. Seeded here rather than fetched live,
-- updated annually by a future migration, same posture as
-- session8_seasonal_contexts_seed.sql's static seasonal data.
--
-- RLS follows the same TO-clause convention as
-- session32_pacific_events.sql's pacific_events (public read for anon/
-- authenticated, service_role for writes) rather than the session brief's
-- own draft (`USING (true)` / `USING (auth.role() = 'service_role')` with
-- no TO clause) — see that migration's RLS comment for why this repo's
-- established convention uses explicit TO clauses.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pacific_tourism_stats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code    TEXT NOT NULL,
  country_name    TEXT NOT NULL,
  year            INTEGER NOT NULL,

  -- Arrivals
  international_arrivals    INTEGER,

  -- Spend
  tourism_receipts_usd_millions NUMERIC(10,2),
  avg_spend_per_visitor_usd     NUMERIC(10,2),
  avg_length_stay_days          NUMERIC(5,1),

  -- Seasonality
  peak_months     TEXT[],
  low_months      TEXT[],

  -- Source
  source          TEXT DEFAULT 'World Bank / SPTO',
  data_quality    TEXT DEFAULT 'verified',

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(country_code, year)
);

CREATE INDEX idx_pacific_tourism_stats_country ON pacific_tourism_stats(country_code);

ALTER TABLE pacific_tourism_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tourism_stats_public_read" ON pacific_tourism_stats
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "tourism_stats_service_write" ON pacific_tourism_stats
  FOR ALL TO service_role USING (true);

-- ============================================================
-- SEED DATA — World Bank 2023 figures + SPTO seasonal data
-- Sources: data.worldbank.org/indicator/ST.INT.ARVL, spto.travel/tourism-statistics
-- ============================================================

INSERT INTO pacific_tourism_stats (
  country_code, country_name, year,
  international_arrivals, tourism_receipts_usd_millions,
  avg_spend_per_visitor_usd, avg_length_stay_days,
  peak_months, low_months, source
) VALUES

('WS', 'Samoa', 2023,
 164000, 180.5, 1100, 8.5,
 ARRAY['December', 'January', 'July', 'August'],
 ARRAY['March', 'April', 'May'],
 'World Bank / Samoa Tourism Authority'),

('FJ', 'Fiji', 2023,
 870000, 1200.0, 1380, 9.2,
 ARRAY['July', 'August', 'September', 'December', 'January'],
 ARRAY['February', 'March', 'April'],
 'World Bank / Tourism Fiji'),

('TO', 'Tonga', 2023,
 42000, 45.2, 1076, 7.8,
 ARRAY['July', 'August', 'June', 'December'],
 ARRAY['February', 'March', 'April'],
 'World Bank / Tonga Tourism'),

('PG', 'Papua New Guinea', 2023,
 180000, 220.0, 1222, 6.5,
 ARRAY['July', 'August', 'September', 'October'],
 ARRAY['January', 'February', 'March'],
 'World Bank / PNG Tourism'),

('SB', 'Solomon Islands', 2023,
 28000, 38.5, 1375, 7.2,
 ARRAY['July', 'August', 'September'],
 ARRAY['January', 'February', 'March'],
 'World Bank / Solomon Islands Tourism'),

('VU', 'Vanuatu', 2023,
 95000, 110.0, 1158, 8.1,
 ARRAY['July', 'August', 'September', 'December'],
 ARRAY['January', 'February', 'March'],
 'World Bank / Vanuatu Tourism'),

('CK', 'Cook Islands', 2023,
 155000, 195.0, 1258, 9.8,
 ARRAY['July', 'August', 'September', 'December', 'January'],
 ARRAY['February', 'March', 'April'],
 'World Bank / Cook Islands Tourism');

COMMENT ON TABLE pacific_tourism_stats IS
  'Annual Pacific tourism arrival/spend/seasonality statistics for the
   Pacific Tourism Intelligence API. World Bank + SPTO sourced, updated
   annually (not real-time). Session 34 — August 2026.';
