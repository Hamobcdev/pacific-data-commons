-- Samoa (WS) Phase A tourism data seed — first real content for the
-- tourism_* tables created in 20261026000001_pacific_tourism_schema.sql.
--
-- NOT YET APPLIED. SUPABASE WRITE APPROVAL REQUEST — awaiting Anthony's
-- sign-off before this is run against poiiwcbriqwczmppoevd.
--
-- ============================================================================
-- SCHEMA CORRECTIONS APPLIED — read before approving
-- ============================================================================
-- Every field name/type below was checked against the ACTUAL migration DDL
-- (20261026000001_pacific_tourism_schema.sql), not the intelligence report's
-- draft schema (docs/intelligence/pacific-tourism-data-framework-intelligence-
-- report.md Part 2), which uses different column names in places (e.g. its
-- draft tourism_cultural_protocols has dress_code_site_specific/sacred_sites/
-- kava_ceremony_protocols — the live table has dress_code_sites/
-- sacred_sites_with_rules/kava_ceremony_protocol). The brief that produced
-- this file's content requested a number of fields that don't exist in the
-- live schema at all; those are listed per table below rather than silently
-- dropped or forced into a wrong-shaped column.
--
-- BLOCK 1 (tourism_destinations UPDATE):
--   - visa_on_arrival requested as boolean `true` — real column is TEXT[]
--     (a list of nationality codes), not a flag. No specific codes were
--     given, so this column is left untouched (NULL) rather than guessing
--     codes; the general "visa on arrival for most nationalities" claim is
--     folded into visa_notes instead.
--   - visa_free_nations -> renamed to the real column `visa_free` (TEXT[]).
--   - entry_requirements_summary -> no such column; content moved into
--     visa_notes (TEXT), which is the real free-text field for exactly this.
--   - drone_rules_detail -> no such column; moved into `drone_notes`.
--   - casino_detail -> no such column; moved into `casino_notes`. Added
--     casino_regulatory_body = 'Gambling Control Authority (GCA)' — sourced
--     from the already-verified intelligence report fact, not fabricated.
--   - film_location_detail -> no single matching column. The Survivor
--     season numbers map to the real `survivor_seasons` TEXT[] column
--     (ARRAY['19','20','23','24']); the "Production enquiries via Samoa
--     Tourism Authority" sentence has no column to live in and is DROPPED.
--   - digital_nomad_notes -> no such column anywhere on this table. DROPPED.
--   - tap_water_safe's parenthetical ("treated but not reliably safe for
--     visitors") placed into the real `tap_water_notes` column.
--
-- BLOCK 2 (tourism_accommodations INSERT, 8 rows):
--   - "island" and "region_area" -> NO SUCH COLUMNS exist on this table at
--     all (no location-granularity text field of any kind beyond the
--     numeric distance_to_* proximity fields). DROPPED for all 8 rows.
--   - "website_url" -> NO SUCH COLUMN on tourism_accommodations (that field
--     lives on tourism_providers, not this table, and the brief explicitly
--     said no tourism_providers rows are being created this pass). DROPPED.
--   - "description_short" -> NO SUCH COLUMN on this table at all (unlike
--     tourism_activities, which has a real `description` field). DROPPED.
--   - "(Sheraton-affiliated)" parenthetical on row 1 mapped to the real
--     `international_chain` column instead of being dropped.
--
-- BLOCK 3 (tourism_activities INSERT, 12 rows):
--   - "description_short" -> renamed to the real column `description`.
--   - "region_area" -> NO SUCH COLUMN; folded into `description` as a
--     "<region_area> — " prefix rather than dropped, since this table does
--     have a free-text description field to hold it.
--   - activity_type/skill_level/coral_health_status/price_per values all
--     checked against the live CHECK constraints — all 12 rows' values are
--     valid, no changes needed there.
--
-- BLOCK 4 (tourism_cultural_protocols INSERT, 1 row):
--   - "dress_code_sites" requested as a single TEXT string — real column is
--     TEXT[]. Wrapped as a one-element array. The shoe-removal sentence
--     bundled into that same string was split out into the real dedicated
--     columns `removal_of_shoes_required` (bool) + `removal_of_shoes_notes`.
--   - "photography_restrictions" -> renamed to the real column
--     `photography_restrictions_general` (there's a separate
--     `photography_restricted_locations TEXT[]` for site-specific rules,
--     not used here since no specific locations were given).
--   - "tipping_culture" -> NO SUCH COLUMN anywhere in this table. DROPPED.
--   - "sacred_sites_with_rules" and "sunday_restrictions" and
--     "kava_ceremony_protocol" were already given under their correct real
--     column names in the brief — no change needed.
--
-- BLOCK 5 (tourism_transport INSERT, 5 rows):
--   - "duration_hours" -> real column is `duration_minutes` (INTEGER).
--     Converted: 1.0h->60, 0.5h->30, 0.75h->45, 3.5h->210 (row 4 gave no
--     duration, left NULL).
--   - "booking_required" (true/false) -> NO SUCH COLUMN; there is no
--     boolean "is booking required" field, only `booking_method` (how) and
--     `booking_url`. DROPPED.
--   - "description_short" -> no such column; moved into `schedule_notes`,
--     the closest real free-text field.
--   - Row 5's nation_code was not given explicitly in the brief (only
--     origin_nation_code='FJ'/destination_nation_code='WS' were specified,
--     but nation_code itself is NOT NULL and is a separate field — "which
--     nation's directory does this route row belong to"). Inferred as 'WS'
--     since this is the Samoa seed and the route's destination is Samoa —
--     FLAGGING this as an inference, not something explicitly stated.
--   - Row 5 (an international Fiji->Samoa flight) uses transport_type
--     'domestic_airline' per the brief — this is a valid CHECK value, but
--     there is no 'international_airline' option in the enum at all, so
--     this is the closest available value rather than a true fit. Not
--     changed (no better option exists), flagged for awareness.
--
-- BLOCK 6 (tourism_food_beverage INSERT, 6 rows):
--   - "island" and "region_area" -> NO SUCH COLUMNS on this table (same gap
--     as tourism_accommodations). DROPPED for all 6 rows.
--   - "description_short" -> NO SUCH COLUMN anywhere on this table either
--     (no free-text description/notes field of any kind exists here).
--     DROPPED for all 6 rows — this is a real content loss with no
--     substitute column available.
--   - "cuisine_type" (singular) -> real column is `cuisine_types` TEXT[]
--     (plural, array). Wrapped as one-element arrays.
--
-- BLOCK 7 (tourism_hazards INSERT, 6 rows):
--   - "hazard_name" -> NO SUCH COLUMN; hazards are identified by
--     `hazard_type` alone. Folded as a leading label into `specific_notes`.
--   - "seasonal" -> real column is `is_seasonal`.
--   - "season_start"/"season_end" as month NAMES -> this table has no TEXT
--     season_start/season_end (unlike tourism_destinations/activities);
--     it has `season_or_period TEXT` (free text) and
--     `season_start_month`/`season_end_month` INTEGER. Populated both:
--     season_or_period as readable text, *_month as the numeric equivalent
--     (November=11, April=4, January=1).
--   - "peak_months" ARRAY -> NO SUCH COLUMN; folded as a sentence into
--     `specific_notes` for row 1 (cyclone) instead of dropped.
--   - "description"/"mitigation" -> renamed to the real columns
--     `specific_notes` / `mitigation_advice`.
--   - "data_source" (block-level closing line) -> real column on this table
--     is `source_of_data`, NOT `data_source` (tourism_hazards is one of the
--     two tables, along with tourism_health_infrastructure, that doesn't
--     follow the common source_type/data_source naming pattern — see audit).
--   - This table has NO `source_type` column at all (confirmed in the prior
--     schema audit) — not set, none requested either.
--
-- BLOCK 8 (tourism_health_infrastructure INSERT, 4 rows):
--   - "region_area" -> NO SUCH COLUMN; mapped to the real `address` column,
--     a reasonable fit since the given values ("Moto'otua, Apia") read as
--     address fragments.
--   - "has_icu" / "has_emergency" -> NO SUCH BOOLEAN COLUMNS exist. Folded
--     as entries into the real `services_available` TEXT[] column instead
--     ('ICU', 'Emergency') rather than dropped outright.
--   - "accepts_travel_insurance" -> NO MATCHING COLUMN. The real columns
--     `travel_insurance_required`/`travel_insurance_recommended` represent a
--     DIFFERENT fact (whether a visitor should carry insurance, not whether
--     the facility processes/accepts it as payment) — forcing this value
--     into either would misrepresent the claim, so it is DROPPED rather
--     than mapped.
--   - "english_speaking_staff" -> NO SUCH COLUMN; folded as a sentence into
--     the real `notes` TEXT column.
--   - "description_short" -> renamed to the real `notes` column (combined
--     with the english_speaking_staff sentence above).
--   - "phone_number" -> real column is `contact_phone`.
--   - This table's `data_source` (unlike tourism_hazards) IS the correct
--     real column name — no rename needed for the block-level closing line.
-- ============================================================================


-- ============================================================================
-- BLOCK 1 — UPDATE tourism_destinations WHERE nation_code = 'WS'
-- (row already exists, id d9c74b86-b38a-48d3-9748-74256a83ae69 — UPDATE,
-- not INSERT, per the prior schema-audit finding)
-- ============================================================================

UPDATE tourism_destinations
SET
  capital_city = 'Apia',
  timezone = 'Pacific/Apia',
  currency_code = 'WST',
  currency_name = 'Samoan Tala',
  official_languages = ARRAY['Samoan', 'English'],
  population = 220000,
  tap_water_safe = false,
  tap_water_notes = 'Treated but not reliably safe for visitors; bottled or filtered water recommended.',
  island_groups = ARRAY['Upolu', 'Savaii', 'Manono', 'Apolima'],
  best_season_start = 'May',
  best_season_end = 'October',
  cyclone_season_start = 'November',
  cyclone_season_end = 'April',
  cyclone_risk_rating = 'high',
  visa_free = ARRAY['AU', 'NZ', 'US', 'UK', 'EU'],
  visa_notes = 'Visa on arrival for most nationalities not covered by a visa-free arrangement. Valid passport required. Return ticket and proof of accommodation required on arrival.',
  evisa_available = false,
  drone_rules = 'permit_required',
  drone_notes = 'Permit required for all drone flights, including recreational. WST $100 fee. Apply a minimum of 7 working days in advance by email to the relevant aviation authority.',
  casino_legal_status = 'licensed_permitted',
  casino_venue_count = 2,
  casino_regulatory_body = 'Gambling Control Authority (GCA)',
  casino_notes = 'Gambling regulated under the Gaming Control Act 2017. Foreign passport holders only — Samoan citizens and residents are barred by law. Two licensed venues operating.',
  film_location_tourism_available = true,
  survivor_seasons = ARRAY['19', '20', '23', '24'],
  digital_nomad_suitability_rating = 2,
  data_confidence = 'curated_unverified',
  data_source = 'PDC intelligence report + general knowledge — verify before publish',
  updated_at = NOW()
WHERE nation_code = 'WS';


-- ============================================================================
-- BLOCK 2 — INSERT tourism_accommodations (8 properties)
-- island/region_area/website_url/description_short dropped — see header.
-- ============================================================================

INSERT INTO tourism_accommodations (
  nation_code, property_name, property_type, star_rating_self_declared,
  international_chain, has_pool, has_restaurant, has_spa,
  has_conference_facilities, conference_max_capacity_theatre,
  has_casino, casino_type, is_wedding_venue,
  price_budget_min_usd, price_budget_max_usd, airport_transfer_type,
  source_type, data_confidence
) VALUES
  ('WS', 'Aggie Grey''s Hotel & Bungalows', 'hotel', 4.0, 'Sheraton',
    true, true, true, true, 300, true, 'full_gaming_floor', true,
    180, 350, 'fee', 'curated', 'curated_unverified'),
  ('WS', 'Taumeasina Island Resort', 'resort', 5.0, NULL,
    true, true, true, true, NULL, false, NULL, true,
    250, 500, 'fee', 'curated', 'curated_unverified'),
  ('WS', 'Sinalei Reef Resort & Spa', 'resort', 4.5, NULL,
    true, true, true, false, NULL, false, NULL, true,
    200, 450, 'fee', 'curated', 'curated_unverified'),
  ('WS', 'Samoa Shores', 'resort', 3.5, NULL,
    true, true, false, false, NULL, false, NULL, false,
    100, 200, 'fee', 'curated', 'curated_unverified'),
  ('WS', 'Taufua Beach Fales', 'beach_fale', 3.0, NULL,
    false, true, false, false, NULL, false, NULL, false,
    40, 80, 'not_available', 'curated', 'curated_unverified'),
  ('WS', 'Jane''s Beach Fales', 'beach_fale', 2.5, NULL,
    false, true, false, false, NULL, false, NULL, false,
    35, 70, 'not_available', 'curated', 'curated_unverified'),
  ('WS', 'Sadie''s by the Sea', 'boutique_hotel', 3.5, NULL,
    true, true, false, false, NULL, false, NULL, false,
    90, 160, 'fee', 'curated', 'curated_unverified'),
  ('WS', 'Le Vasa Resort', 'resort', 4.0, NULL,
    true, true, true, true, NULL, false, NULL, false,
    150, 300, 'fee', 'curated', 'curated_unverified');


-- ============================================================================
-- BLOCK 3 — INSERT tourism_activities (12 activities)
-- description_short -> description; region_area folded into description
-- as a prefix (no dedicated column) — see header.
-- ============================================================================

INSERT INTO tourism_activities (
  nation_code, island, location_name, activity_name, activity_type,
  skill_level, certification_required, reef_coordinate_lat,
  reef_coordinate_lng, coral_health_status, season_start, season_end,
  price_min_usd, price_max_usd, price_per, description,
  source_type, data_confidence
) VALUES
  ('WS', 'Upolu', 'Palolo Deep Marine Reserve', 'Palolo Deep Snorkel & Dive',
    'dive_site', 'beginner', false, -13.8333, -171.7667, 'good', NULL, NULL,
    NULL, NULL, NULL,
    'Apia — Shore-accessible marine reserve minutes from Apia. Excellent coral and fish diversity.',
    'curated', 'curated_unverified'),
  ('WS', 'Upolu', 'Salani Surf Resort Area', 'Salani Reef Break',
    'surf_break', 'advanced', false, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    'South Coast — Consistent reef break for experienced surfers. Best May–October.',
    'curated', 'curated_unverified'),
  ('WS', 'Upolu', 'Boulders Surf Break', 'Boulders Surf',
    'surf_break', 'intermediate', NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    'South Coast — Intermediate reef break. Regular swell during dry season.',
    'curated', 'curated_unverified'),
  ('WS', 'Upolu', 'To Sua Ocean Trench', 'To Sua Ocean Trench Swim',
    'waterfall', 'beginner', false, NULL, NULL, NULL, NULL, NULL,
    10, 10, 'person',
    'Lotofaga — Iconic natural swimming hole connected to the ocean via lava tunnel. Entry fee applies.',
    'curated', 'curated_unverified'),
  ('WS', 'Upolu', 'Upolu Island', 'Humpback Whale Watching',
    'whale_watching', 'beginner', false, NULL, NULL, NULL, 'July', 'October',
    80, 150, 'person',
    'Humpback whales pass through Samoa waters July–October on their annual migration.',
    'curated', 'curated_unverified'),
  ('WS', 'Upolu', 'Various Villages, Upolu', 'Samoan Village Cultural Tour',
    'village_immersion', 'beginner', NULL, NULL, NULL, NULL, NULL, NULL,
    30, 80, 'person',
    'Traditional village visits including demonstrations of weaving, cooking, and Samoan customs.',
    'curated', 'curated_unverified'),
  ('WS', 'Upolu', 'Apia', 'Kava Ceremony Experience',
    'kava_ceremony', 'beginner', NULL, NULL, NULL, NULL, NULL, NULL,
    20, 50, 'person',
    'Apia — Traditional ava ceremony introduction. Culturally significant — respect protocols apply.',
    'curated', 'curated_unverified'),
  ('WS', 'Upolu', 'Apia', 'Fiafia Night Cultural Show',
    'fiafia_night', 'beginner', NULL, NULL, NULL, NULL, NULL, NULL,
    40, 80, 'person',
    'Apia — Traditional Samoan song, dance and fireknife performance. Usually includes a buffet dinner.',
    'curated', 'curated_unverified'),
  ('WS', 'Savaii', 'Savaii Island', 'Savaii Day Trip',
    'day_trip', 'beginner', NULL, NULL, NULL, NULL, NULL, NULL,
    60, 120, 'person',
    'Full day exploring Savaii including lava fields, blowholes, and traditional villages.',
    'curated', 'curated_unverified'),
  ('WS', 'Upolu', 'Upolu South Coast', 'South Coast Waterfall Tour',
    'waterfall', 'beginner', NULL, NULL, NULL, NULL, NULL, NULL,
    40, 80, 'person',
    'South Coast — Multi-waterfall tour along the scenic south coast road. Includes swimming stops.',
    'curated', 'curated_unverified'),
  ('WS', 'Upolu', 'Apia', 'Robert Louis Stevenson Museum Visit',
    'historical_site', 'beginner', NULL, NULL, NULL, NULL, NULL, NULL,
    10, 15, 'person',
    'Apia — Villa Vailima, former home of Robert Louis Stevenson, now a museum. Well-preserved colonial heritage site.',
    'curated', 'curated_unverified'),
  ('WS', 'Upolu', 'Upolu', 'Deep Sea Fishing Charter',
    'fishing_charter', 'beginner', NULL, NULL, NULL, NULL, NULL, NULL,
    150, 400, 'vessel',
    'Half and full day deep sea fishing charters. Target species: yellowfin tuna, wahoo, mahi-mahi.',
    'curated', 'curated_unverified');


-- ============================================================================
-- BLOCK 4 — INSERT tourism_cultural_protocols (1 row, WS)
-- UNIQUE(nation_code) — this is the only row that will ever exist for WS
-- in this table. tipping_culture dropped (no column) — see header.
-- ============================================================================

INSERT INTO tourism_cultural_protocols (
  nation_code, dress_code_general, dress_code_sites,
  removal_of_shoes_required, removal_of_shoes_notes,
  sacred_sites_with_rules, sunday_restrictions, taboo_behaviours,
  kava_ceremony_protocol, photography_restrictions_general,
  data_confidence, data_source
) VALUES (
  'WS',
  'Modest dress required outside resorts. Shoulders and knees covered when entering villages, churches, and government buildings. Swimwear only acceptable at beach and resort areas.',
  ARRAY['Ie toga (fine mat) or lavalava appropriate for formal occasions.'],
  true,
  'Remove shoes before entering Samoan homes and some traditional structures.',
  '[{"site": "Village malae (village green)", "rule": "Do not walk across the malae without permission from village chief"}, {"site": "Church grounds", "rule": "Modest dress mandatory, no loud behaviour during Sunday observance"}, {"site": "Chiefs residence (fale tele)", "rule": "Wait to be invited before approaching or entering"}]'::jsonb,
  'Sunday is strictly observed. Most shops, restaurants, and markets are closed. Swimming at beaches near villages may be restricted during church hours (typically 8am–12pm and 6pm–8pm). Hotels and resorts operate normally with board approval.',
  ARRAY[
    'Pointing feet toward people or the front of a fale',
    'Eating or drinking while standing or walking through a village',
    'Entering a village during to''ona''i (Sunday lunch) without invitation',
    'Loud music or disruptive behaviour near churches',
    'Photography of ceremonies without explicit permission'
  ],
  'Ava (kava) ceremony is central to Samoan protocol. When offered, accept with both hands and say "Soifua" before drinking. Declining is acceptable but should be done respectfully. Do not touch the tanoa (kava bowl) unless invited.',
  'Ask permission before photographing people, especially in villages and during ceremonies. Photography inside churches is generally not permitted during services.',
  'curated_unverified',
  'PDC intelligence report + cultural knowledge — verify with Samoa Tourism Authority before publish'
);


-- ============================================================================
-- BLOCK 5 — INSERT tourism_transport (5 routes)
-- duration_hours -> duration_minutes (converted); booking_required dropped
-- (no column); description_short -> schedule_notes; row 5's nation_code
-- inferred as 'WS' (not explicitly given) — see header.
-- ============================================================================

INSERT INTO tourism_transport (
  nation_code, transport_type, operator_name, origin, destination,
  origin_nation_code, destination_nation_code, frequency,
  duration_minutes, price_min_usd, price_max_usd, booking_method,
  schedule_notes, source_type, data_confidence
) VALUES
  ('WS', 'ferry', 'Samoa Shipping Corporation', 'Mulifanua Wharf, Upolu',
    'Salelologa Wharf, Savaii', 'WS', 'WS', 'multiple_daily', 60, 5, 15,
    ARRAY['walk_up', 'phone'],
    'Main inter-island ferry between Upolu and Savaii. Vehicle and passenger service. Multiple departures daily.',
    'curated', 'curated_unverified'),
  ('WS', 'domestic_airline', 'Samoa Airways', 'Faleolo International Airport (APW), Upolu',
    'Maota Airport, Savaii', 'WS', 'WS', 'daily', 30, 60, 120,
    ARRAY['online', 'phone'], NULL,
    'curated', 'curated_unverified'),
  ('WS', 'airport_transfer', 'Resort Transfers', 'Faleolo International Airport (APW)',
    'Apia City Hotels', 'WS', 'WS', 'on_demand', 45, 25, 60,
    ARRAY['hotel', 'phone'],
    'Shared and private transfers between Faleolo airport and Apia. Book through accommodation.',
    'curated', 'curated_unverified'),
  ('WS', 'car_hire', 'Budget Car Rental Samoa', 'Faleolo International Airport (APW)',
    'Self-drive — Upolu Island', 'WS', 'WS', 'on_demand', NULL, 60, 120,
    ARRAY['online', 'phone'],
    'Left-hand drive. International licence accepted for first 3 months. Roads are sealed on main routes; 4WD recommended for south coast.',
    'curated', 'curated_unverified'),
  ('WS', 'domestic_airline', 'Fiji Airways', 'Nadi International Airport (NAN), Fiji',
    'Faleolo International Airport (APW), Samoa', 'FJ', 'WS', 'several_weekly', 210, 300, 800,
    ARRAY['online'], NULL,
    'curated', 'curated_unverified');


-- ============================================================================
-- BLOCK 6 — INSERT tourism_food_beverage (6 venues)
-- island/region_area/description_short all dropped — no matching column
-- exists for any of them on this table. cuisine_type -> cuisine_types[].
-- ============================================================================

INSERT INTO tourism_food_beverage (
  nation_code, venue_name, venue_type, cuisine_types, dining_tier,
  kava_available, kava_type, source_type, data_confidence
) VALUES
  ('WS', 'Paddles Restaurant', 'restaurant', ARRAY['Pacific fusion'], 'mid_range',
    false, NULL, 'curated', 'curated_unverified'),
  ('WS', 'Scalinis', 'restaurant', ARRAY['Italian'], 'mid_range',
    false, NULL, 'curated', 'curated_unverified'),
  ('WS', 'RSA Club Apia', 'bar', NULL, 'casual',
    false, NULL, 'curated', 'curated_unverified'),
  ('WS', 'Fugalei Market', 'market_stall', ARRAY['Samoan traditional'], 'street_food',
    false, NULL, 'curated', 'curated_unverified'),
  ('WS', 'Fia Fia Kava Bar', 'kava_bar', NULL, 'casual',
    true, 'social', 'curated', 'curated_unverified'),
  ('WS', 'Sails Restaurant', 'hotel_restaurant', ARRAY['Pacific contemporary'], 'fine_dining',
    false, NULL, 'curated', 'curated_unverified');


-- ============================================================================
-- BLOCK 7 — INSERT tourism_hazards (6 hazards)
-- hazard_name/peak_months folded into specific_notes (no columns exist);
-- seasonal -> is_seasonal; season_start/end month names -> season_or_period
-- (text) + season_start_month/season_end_month (int); description ->
-- specific_notes; mitigation -> mitigation_advice; data_source ->
-- source_of_data (this table's real column name, not data_source).
-- No source_type column exists on this table — none set.
-- ============================================================================

INSERT INTO tourism_hazards (
  nation_code, island, hazard_type, risk_level, is_seasonal,
  season_or_period, season_start_month, season_end_month,
  specific_notes, mitigation_advice, source_of_data
) VALUES
  ('WS', NULL, 'cyclone', 'high', true, 'November–April', 11, 4,
    'Tropical Cyclone Season. Peak risk: February–March. Samoa lies in the South Pacific cyclone belt. Tropical cyclones possible November–April, peak February–March. Category 5 Cyclone Evan (2012) and Cyclone Harold (2020) caused significant damage. Monitor SPREP and Samoa Met Service advisories.',
    'Travel insurance with cyclone cover essential. Check SPREP forecasts. Follow hotel and government evacuation instructions immediately.',
    'PDC intelligence report + WHO/SPREP data'),
  ('WS', 'Upolu', 'riptide', 'medium', false, NULL, NULL, NULL,
    'Coastal Riptides. Riptides present at several beaches, particularly on the south coast. Lalomanu and other exposed beaches can have strong rips.',
    'Swim only at patrolled or recommended areas. Ask locals before entering unfamiliar water. Never swim alone.',
    'PDC intelligence report + WHO/SPREP data'),
  ('WS', NULL, 'coral_cuts', 'medium', false, NULL, NULL, NULL,
    'Reef Coral Cuts. Sharp coral reef edges are a common hazard for swimmers and snorkellers. Cuts can become infected rapidly in tropical conditions.',
    'Wear reef shoes or wetsuit booties. Clean cuts immediately with fresh water and antiseptic. Seek medical attention if signs of infection appear.',
    'PDC intelligence report + WHO/SPREP data'),
  ('WS', NULL, 'uv_extreme', 'high', false, NULL, NULL, NULL,
    'Extreme UV Radiation. UV index regularly reaches extreme levels (10+) year-round. Significant burn risk within 15 minutes of unprotected exposure at peak hours.',
    'SPF 50+ sunscreen, reapply every 2 hours. Protective clothing and hat. Avoid prolonged sun exposure 10am–3pm.',
    'PDC intelligence report + WHO/SPREP data'),
  ('WS', NULL, 'dengue', 'medium', true, 'January–April', 1, 4,
    'Dengue Fever. Dengue fever is endemic to Samoa. Risk higher during wet season (November–April). Outbreaks occurred 2019–2020.',
    'DEET-based insect repellent. Long sleeves and pants at dawn and dusk. Seek medical attention if high fever develops within 2 weeks of visit.',
    'PDC intelligence report + WHO/SPREP data'),
  ('WS', NULL, 'stonefish', 'medium', false, NULL, NULL, NULL,
    'Stonefish. Stonefish present in reef areas. Camouflaged on rocky reef and sandy bottom. Venom is extremely painful and medically serious.',
    'Never walk barefoot on reef or sandy reef areas. Wear reef shoes. If stung, immerse in hot water immediately and seek urgent medical attention.',
    'PDC intelligence report + WHO/SPREP data');


-- ============================================================================
-- BLOCK 8 — INSERT tourism_health_infrastructure (4 facilities)
-- region_area -> address; has_icu/has_emergency folded into
-- services_available[]; accepts_travel_insurance DROPPED (no matching
-- column — see header); english_speaking_staff folded into notes;
-- description_short -> notes; phone_number -> contact_phone.
-- ============================================================================

INSERT INTO tourism_health_infrastructure (
  nation_code, island, facility_name, facility_type, address,
  contact_phone, has_surgical_capacity, has_evacuation_capability,
  services_available, notes, data_confidence, data_source
) VALUES
  ('WS', 'Upolu', 'Tupua Tamasese Meaole Hospital (TTM)', 'hospital_surgical',
    'Moto''otua, Apia', '+685 21212', true, false,
    ARRAY['ICU', 'Emergency'],
    'Main national hospital. Surgical and emergency capability. Primary facility for serious injuries and illness in Samoa. English-speaking staff.',
    'curated_unverified', 'General knowledge — verify facility details with Samoa Ministry of Health before publish'),
  ('WS', 'Savaii', 'Malietoa Tanumafili II Hospital', 'hospital_surgical',
    'Safotulafai', NULL, true, false,
    ARRAY['Emergency'],
    'Main hospital for Savaii Island. Basic surgical and emergency services. English-speaking staff.',
    'curated_unverified', 'General knowledge — verify facility details with Samoa Ministry of Health before publish'),
  ('WS', 'Upolu', 'SOS Medical Clinic', 'clinic_basic',
    'Apia', NULL, false, false,
    NULL,
    'Private clinic in Apia. Suitable for minor injuries, illness, travel health consultations. English-speaking staff.',
    'curated_unverified', 'General knowledge — verify facility details with Samoa Ministry of Health before publish'),
  ('WS', 'Upolu', 'Medevac — No Decompression Chamber', 'evacuation_service',
    NULL, NULL, false, true,
    NULL,
    'No hyperbaric/decompression chamber exists in Samoa. Dive emergency patients require medical evacuation to Auckland, New Zealand (approximately 3 hours). Comprehensive dive travel insurance with medevac cover is essential.',
    'curated_unverified', 'General knowledge — verify facility details with Samoa Ministry of Health before publish');

-- ============================================================================
-- END OF MIGRATION — NOT YET APPLIED, AWAITING APPROVAL
-- ============================================================================
