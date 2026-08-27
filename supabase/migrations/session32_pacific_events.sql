-- ============================================================================
-- Session 32 — Pacific Events Intelligence + Tourism Orchestrator
-- (STA demo backing table: /pacific/events and /intelligence/pacific-travel)
--
-- Pacific Events table — stores structured data for Pacific Island events:
-- festivals, concerts, sporting events, cultural celebrations, religious
-- gatherings, national days. Data sourced from public sources (SPTO,
-- government calendars, festival official sites). Treated as untrusted
-- input in the tourism orchestrator's synthesis prompt (Decision 58) —
-- never executed as code or instructions, only read as JSON data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pacific_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identity
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE, -- url-safe identifier
  description       TEXT NOT NULL,

  -- Classification
  category          TEXT NOT NULL CHECK (category IN (
                      'festival', 'concert', 'sport', 'cultural',
                      'religious', 'political', 'business', 'other'
                    )),
  subcategory       TEXT, -- e.g. 'music', 'traditional dance', 'rugby'

  -- Location
  country_code      TEXT NOT NULL, -- ISO 3166-1 alpha-2
  country_name      TEXT NOT NULL,
  city              TEXT,
  venue             TEXT,

  -- Timing
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  is_annual         BOOLEAN DEFAULT TRUE,
  -- For annual events: month_start/month_end for recurrence planning
  typical_month_start INTEGER CHECK (typical_month_start BETWEEN 1 AND 12),
  typical_month_end   INTEGER CHECK (typical_month_end BETWEEN 1 AND 12),

  -- Tourism impact
  expected_attendance INTEGER,
  tourism_impact    TEXT CHECK (tourism_impact IN (
                      'very_high', 'high', 'medium', 'low'
                    )),
  international_visitors BOOLEAN DEFAULT FALSE,
  diaspora_draw     BOOLEAN DEFAULT FALSE, -- Pacific diaspora specifically

  -- Intelligence context (for synthesis)
  highlights        TEXT[], -- key attractions or activities
  travel_tips       TEXT,   -- practical info for visitors
  booking_lead_time TEXT,   -- e.g. "book 3 months ahead for Christmas"

  -- Source and provenance
  source            TEXT NOT NULL, -- e.g. 'SPTO', 'Samoa Tourism Authority'
  source_url        TEXT,
  data_quality      TEXT CHECK (data_quality IN (
                      'verified', 'public', 'estimated'
                    )) DEFAULT 'public',

  -- Metadata
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common query patterns (pacificEventsService.ts's
-- getUpcomingEvents: is_active + date range, optional country/category)
CREATE INDEX idx_pacific_events_country ON pacific_events(country_code);
CREATE INDEX idx_pacific_events_dates ON pacific_events(start_date, end_date);
CREATE INDEX idx_pacific_events_category ON pacific_events(category);
CREATE INDEX idx_pacific_events_active ON pacific_events(is_active);
CREATE INDEX idx_pacific_events_month ON pacific_events(typical_month_start);

-- RLS — same TO-clause convention as session19_external_sources.sql's
-- approved_external_sources (public read for active rows, service_role for
-- writes; directory-api's own Supabase client uses the service role key and
-- bypasses RLS entirely per lib/supabase.ts, but this is the anon-key
-- backstop for any direct client access, same posture as every other public
-- PDC table).
ALTER TABLE pacific_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_public_read" ON pacific_events
  FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE POLICY "events_service_write" ON pacific_events
  FOR ALL TO service_role USING (true);

-- Reuses the shared update_updated_at() trigger function defined in
-- session1_migration.sql (see session6_endpoint_deployments.sql and
-- session9_institutions_schema.sql for the same reuse pattern) rather than
-- defining a new per-table function.
CREATE TRIGGER pacific_events_updated_at
  BEFORE UPDATE ON pacific_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED DATA — Major Pacific Events
-- Sources: SPTO, government websites, festival official sites.
-- All public information, no proprietary data.
-- ============================================================

INSERT INTO pacific_events (
  name, slug, description, category, subcategory,
  country_code, country_name, city,
  start_date, end_date, is_annual,
  typical_month_start, typical_month_end,
  expected_attendance, tourism_impact,
  international_visitors, diaspora_draw,
  highlights, travel_tips, booking_lead_time,
  source, data_quality
) VALUES

-- SAMOA
('Teuila Tourism Festival',
 'teuila-festival-samoa',
 'Samoa''s premier annual tourism and cultural festival celebrating Samoan culture, arts, music, and traditions. Named after the red ginger flower, teuila. Features traditional dance competitions, sporting events, food festivals, and cultural showcases.',
 'festival', 'cultural',
 'WS', 'Samoa', 'Apia',
 '2026-09-01', '2026-09-05', TRUE, 9, 9,
 50000, 'very_high', TRUE, TRUE,
 ARRAY['Traditional fiafia nights', 'Samoan cultural dance competitions', 'Slit drum performances', 'Samoan food festival', 'Craft markets'],
 'Book accommodation at least 2 months ahead. The festival runs across multiple venues in Apia. Faleolo Airport sees increased traffic — arrive early on departure days.',
 '2 months ahead',
 'Samoa Tourism Authority', 'verified'),

('Samoa Independence Day Celebrations',
 'samoa-independence-day',
 'Samoa''s national independence day celebrations marking independence from New Zealand in 1962. Features military parades, traditional ceremonies, cultural performances, and community celebrations across the islands.',
 'political', 'national day',
 'WS', 'Samoa', 'Apia',
 '2026-06-01', '2026-06-04', TRUE, 6, 6,
 30000, 'high', FALSE, TRUE,
 ARRAY['Military parade', 'Traditional ceremonies', 'Ava ceremony', 'Community feasts', 'Church services'],
 'A deeply meaningful occasion for Samoan families. Respectful dress recommended for formal events.',
 '1 month ahead',
 'Government of Samoa', 'verified'),

('Samoa Christmas and New Year',
 'samoa-christmas-new-year',
 'The peak tourism season for Samoa, driven by Pacific diaspora returning home from New Zealand, Australia, and the United States. Hotels and resorts at maximum occupancy. Festive atmosphere throughout the islands with beach celebrations, family gatherings, and fireworks.',
 'festival', 'holiday season',
 'WS', 'Samoa', 'Apia',
 '2026-12-20', '2027-01-05', TRUE, 12, 1,
 80000, 'very_high', TRUE, TRUE,
 ARRAY['Beach celebrations', 'Family reunion season', 'New Year fireworks over the harbour', 'Christmas Eve church services', 'Samoan feast traditions'],
 'Book at least 3 months ahead. Flights from Auckland and Sydney fill up by October. Exchange NZD/AUD to WST before arriving — better rates in Apia.',
 '3 months ahead',
 'SPTO', 'verified'),

-- FIJI
('Fiji Hibiscus Festival',
 'fiji-hibiscus-festival',
 'Fiji''s largest annual festival held in Suva, featuring the crowning of the Hibiscus Queen, carnival rides, food stalls, live music, and cultural performances. One of the most anticipated events in the Pacific.',
 'festival', 'cultural',
 'FJ', 'Fiji', 'Suva',
 '2026-08-10', '2026-08-16', TRUE, 8, 8,
 100000, 'very_high', TRUE, TRUE,
 ARRAY['Hibiscus Queen competition', 'Carnival', 'Live music', 'Food stalls', 'Cultural performances', 'Fireworks'],
 'The festival is family-friendly. Suva can be busy — book accommodation in advance.',
 '6 weeks ahead',
 'SPTO', 'verified'),

('Fiji Day National Celebrations',
 'fiji-day-celebrations',
 'Fiji''s national day celebrating independence from Britain on 10 October 1970. Features parades, traditional ceremonies, cultural performances, and community events across all major Fijian islands.',
 'political', 'national day',
 'FJ', 'Fiji', 'Suva',
 '2026-10-10', '2026-10-10', TRUE, 10, 10,
 50000, 'high', FALSE, TRUE,
 ARRAY['National parade', 'Traditional ceremonies', 'Cultural performances', 'Community events'],
 'Public holiday across Fiji. Many businesses closed.',
 '2 weeks ahead',
 'Tourism Fiji', 'verified'),

('Fiji Rugby Sevens Season',
 'fiji-rugby-sevens',
 'Fiji''s national rugby sevens team is one of the most celebrated in the world. International sevens tournaments and local competitions draw passionate crowds throughout the season. Fiji sevens is a cultural institution.',
 'sport', 'rugby',
 'FJ', 'Fiji', 'Suva',
 '2026-11-01', '2027-04-30', TRUE, 11, 4,
 30000, 'medium', TRUE, TRUE,
 ARRAY['World-class sevens rugby', 'Passionate local crowds', 'Post-match celebrations'],
 'Check the World Rugby Sevens Series schedule for international events.',
 '1 month ahead',
 'SPTO', 'public'),

-- TONGA
('Heilala Festival',
 'heilala-festival-tonga',
 'Tonga''s national week-long festival celebrating the birthday of the King and Tongan culture. Features the Miss Heilala beauty pageant, traditional dancing, music, sports competitions, and cultural displays. Named after the heilala flower — Tonga''s national flower.',
 'festival', 'cultural',
 'TO', 'Tonga', 'Nuku''alofa',
 '2026-07-01', '2026-07-07', TRUE, 7, 7,
 40000, 'very_high', TRUE, TRUE,
 ARRAY['Miss Heilala pageant', 'Traditional lakalaka dancing', 'Ngatu (tapa cloth) making', 'Kava ceremonies', 'Sports competitions', 'Fireworks'],
 'Book accommodation early — the festival coincides with school holidays in New Zealand and Australia.',
 '2 months ahead',
 'Tonga Tourism', 'verified'),

-- COOK ISLANDS
('Cook Islands Constitution Day',
 'cook-islands-constitution-day',
 'The Cook Islands'' most important national celebration marking self-governance in free association with New Zealand. Features traditional dance competitions (including the famous Cook Islands dance), sports, music, and cultural events. One of the Pacific''s most colourful national celebrations.',
 'festival', 'national day',
 'CK', 'Cook Islands', 'Avarua',
 '2026-08-01', '2026-08-10', TRUE, 8, 8,
 20000, 'very_high', TRUE, TRUE,
 ARRAY['Cook Islands dance competitions', 'Traditional sports', 'Cultural exhibitions', 'Beach events', 'Night markets'],
 'Rarotonga is small — book well ahead. The island becomes very lively during Constitution celebrations.',
 '3 months ahead',
 'Cook Islands Tourism', 'verified'),

-- PAPUA NEW GUINEA
('PNG Goroka Show',
 'png-goroka-show',
 'One of the largest cultural festivals in the Pacific, bringing together hundreds of tribal groups from across Papua New Guinea for three days of traditional sing-sing, dance, and cultural display. An extraordinary window into PNG''s extraordinary cultural diversity.',
 'festival', 'cultural',
 'PG', 'Papua New Guinea', 'Goroka',
 '2026-09-16', '2026-09-18', TRUE, 9, 9,
 100000, 'very_high', TRUE, FALSE,
 ARRAY['Hundreds of tribal groups', 'Traditional sing-sing', 'Face painting and traditional dress', 'Drums and traditional music', 'Cultural exchange'],
 'Goroka is in the highlands — bring layers. Book Goroka accommodation months ahead. Tours from Port Moresby available.',
 '3 months ahead',
 'PNG Tourism', 'verified'),

('PNG Hiri Moale Festival',
 'png-hiri-moale-festival',
 'Port Moresby''s annual festival commemorating the historic Hiri trade voyages of the Motu people. Features traditional Lagatoi canoe races, cultural performances, the Hiri Hanenamo Queen competition, and traditional food.',
 'festival', 'cultural',
 'PG', 'Papua New Guinea', 'Port Moresby',
 '2026-09-14', '2026-09-16', TRUE, 9, 9,
 50000, 'high', TRUE, FALSE,
 ARRAY['Lagatoi canoe races', 'Hiri Hanenamo Queen competition', 'Traditional Motu culture', 'Cultural performances'],
 'Held in Port Moresby — accessible from the international airport.',
 '1 month ahead',
 'PNG Tourism', 'verified'),

-- VANUATU
('Vanuatu Independence Day',
 'vanuatu-independence-day',
 'Vanuatu''s national independence day celebrating independence from joint British-French rule in 1980. Features traditional kastom ceremonies, military parades, cultural dances, and community celebrations.',
 'political', 'national day',
 'VU', 'Vanuatu', 'Port Vila',
 '2026-07-30', '2026-07-30', TRUE, 7, 7,
 20000, 'medium', FALSE, TRUE,
 ARRAY['Traditional kastom ceremonies', 'Military parade', 'Cultural dances', 'Community feasts'],
 'Public holiday. Most businesses closed.',
 '2 weeks ahead',
 'Vanuatu Tourism', 'public'),

-- SOLOMON ISLANDS
('Solomon Islands Independence Day',
 'solomon-islands-independence-day',
 'Solomon Islands'' national independence day celebrating independence from Britain in 1978. Features traditional ceremonies, cultural performances, canoe racing, and community celebrations across the islands.',
 'political', 'national day',
 'SB', 'Solomon Islands', 'Honiara',
 '2026-07-07', '2026-07-07', TRUE, 7, 7,
 15000, 'medium', FALSE, TRUE,
 ARRAY['Traditional ceremonies', 'Cultural performances', 'Canoe racing', 'Community events'],
 'Public holiday across Solomon Islands.',
 '2 weeks ahead',
 'Solomon Islands Tourism', 'public'),

-- PACIFIC-WIDE
('Pacific Games 2027',
 'pacific-games-2027',
 'The Pacific Games is the largest multi-sport event in Oceania, bringing together athletes from across the Pacific Islands. Hosted every four years, the next edition in 2027 will be a major draw for Pacific diaspora and sports fans across the region.',
 'sport', 'multi-sport',
 'WS', 'Samoa', 'Apia',
 '2027-07-01', '2027-07-20', FALSE, 7, 7,
 200000, 'very_high', TRUE, TRUE,
 ARRAY['Multi-sport competition', 'Pacific nations competing', 'Opening and closing ceremonies', 'Cultural programme'],
 'The largest Pacific sporting event. Book accommodation 6 months ahead minimum. Samoa is the host nation.',
 '6 months ahead',
 'Pacific Games Council', 'public');

COMMENT ON TABLE pacific_events IS
  'Pacific Island events for the Pacific Tourism Intelligence API.
   Data sourced from public sources. Treated as untrusted input in
   synthesis — never executed as code or instructions.
   Session 32 — August 2026.';
