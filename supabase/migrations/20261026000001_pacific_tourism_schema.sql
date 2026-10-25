-- Pacific Tourism Data Framework — Phase A
-- Schema migration only
-- Phase B: Cloudflare Worker endpoints (separate PR)
-- Phase C: Next.js provider registration form (separate PR)
-- NFT stubs: inert — TipTide integration is a future build
-- Intelligence report:
--   docs/intelligence/pacific-tourism-data-framework-intelligence-report.md
-- Author: PDC build session 2026-10-26
-- VITE_FLAG_LIVE_RPC_ACTIVE=false (not applicable
--   to this file but noted per CLAUDE.md)
--
-- ============================================================================
-- FINDINGS — recorded before any DDL, per session brief
-- ============================================================================
--
-- 1) Migration file naming: the brief's own example ("if the last migration
--    is 0045_something.sql, yours is 0046_...") does not match any file in
--    supabase/migrations/ — there is no 00XX_*.sql numbering scheme in this
--    repo at all. The actual, currently-in-use convention (every migration
--    from 2026-10-05 onward: 20261005071120_*.sql ... 20261021000012_*.sql)
--    is Supabase CLI's native UTC timestamp prefix, YYYYMMDDHHMMSS_description.sql.
--    Older ad-hoc sessionN_*.sql names are legacy and not the live pattern.
--    This file follows the real, current convention: 20261026000001 (first
--    migration dated 2026-10-26, no same-day file exists yet).
--
-- 2) pacific_events ALREADY EXISTS (supabase/migrations/session32_pacific_events.sql).
--    Existing columns: id, name, slug, description, category, subcategory,
--    country_code, country_name, city, venue, start_date, end_date, is_annual,
--    typical_month_start, typical_month_end, expected_attendance, tourism_impact,
--    international_visitors, diaspora_draw, highlights, travel_tips,
--    booking_lead_time, source, source_url, data_quality, is_active,
--    created_at, updated_at. It already has RLS enabled (events_public_read /
--    events_service_write) and an updated_at trigger wired to update_updated_at().
--    `expected_attendance INTEGER` already exists — NOT re-added below.
--    Extended via ALTER TABLE only, per hard rule — no CREATE TABLE, no RENAME
--    (the intelligence report's own §0.1/Part-2-decision-4 suggests renaming
--    this table to tourism_events; that recommendation is NOT followed here —
--    the session brief explicitly requires ALTER TABLE in place, and the
--    brief supersedes the report's design suggestion for this migration).
--
-- 3) pacific_tourism_stats ALREADY EXISTS (supabase/migrations/session34_pacific_tourism_stats.sql).
--    Existing columns: id, country_code, country_name, year,
--    international_arrivals, tourism_receipts_usd_millions,
--    avg_spend_per_visitor_usd, avg_length_stay_days, peak_months, low_months,
--    source, data_quality, created_at. No updated_at column exists on this
--    table and none is added here — out of scope (brief lists only
--    source_type/data_confidence/data_source/last_verified for this table).
--    Extended via ALTER TABLE only, no CREATE TABLE.
--
-- 4) endpoints.data_category already has 'tourism' as a valid value —
--    confirmed directly in supabase/migrations/session20_category_expansion.sql's
--    endpoints_data_category_check constraint. No enum/constraint change made
--    or needed in this migration.
--
-- 5) providers.trust_tier confirmed in session1_migration.sql: TEXT DEFAULT
--    'bronze' CHECK (trust_tier IN ('bronze','silver','gold')). There is no
--    separate trust_tiers table anywhere in this codebase. tourism_providers
--    below carries its own independent trust_tier TEXT column (default
--    'community', no CHECK — as specified in the brief; it does not reuse or
--    duplicate the providers enum, it mirrors it informationally only) and a
--    nullable FK to providers(id). Per hard rule 2, the providers table
--    itself is not touched.
--
-- 6) Shared updated_at trigger function: this codebase already has one,
--    but it is named update_updated_at() (defined once in
--    session1_migration.sql, reused by session6/session9/session32/session37),
--    NOT set_updated_at() as the brief's Step 6 names it. Per Step 6's own
--    instruction ("if the project already has [an updated_at trigger
--    function], apply it... if not, create it"), the existing
--    update_updated_at() function is reused below for every new table rather
--    than creating a second, duplicate function under a different name.
--    (A pdqe.set_updated_at() function also exists, but it lives in the
--    separate `pdqe` schema for an unrelated subsystem and is not reusable
--    here.)
--
-- 7) RLS pattern: two conventions coexist in this repo. The majority
--    (session1/session32/session34 and others) use: permissive SELECT for
--    anon + authenticated, and a single ALL/write policy restricted to
--    service_role. The single most recent file (20261021000007_pdc_events.sql)
--    instead grants INSERT/UPDATE/DELETE table privileges to `authenticated`
--    directly. The session brief's own Step 5 explicitly asks for "a
--    permissive SELECT policy for authenticated and anon" plus
--    "INSERT/UPDATE/DELETE policies restricted to authenticated role only" —
--    that explicit, session-specific instruction is followed below, but
--    scoped down per a subsequent fix: each table carries THREE policies —
--    `<table>_public_read` (anon+authenticated, SELECT), `<table>_authenticated_insert`
--    (authenticated, INSERT only), and `<table>_service_write` (service_role,
--    UPDATE only). DELETE has no explicit policy for any role — authenticated
--    users cannot delete tourism records through the frontend; service_role
--    bypasses RLS entirely regardless (per every existing table's own
--    comments) and so can still UPDATE or DELETE directly.
--
-- ============================================================================


-- ============================================================================
-- STEP 1 — EXTEND EXISTING TABLES (ALTER TABLE only, no CREATE TABLE)
-- ============================================================================

-- pacific_events: add tourism-framework columns not already present.
ALTER TABLE pacific_events
  ADD COLUMN IF NOT EXISTS event_category TEXT CHECK (event_category IN (
    'cultural_festival', 'sporting', 'business_conference', 'religious',
    'christmas_new_year', 'independence_day', 'agricultural_show',
    'music_festival', 'food_festival'
  )),
  ADD COLUMN IF NOT EXISTS is_tourist_friendly BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ticket_price_min NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS ticket_price_max NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS ticket_currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS booking_url TEXT,
  ADD COLUMN IF NOT EXISTS data_confidence TEXT DEFAULT 'curated_unverified' CHECK (data_confidence IN (
    'verified', 'curated_unverified', 'provider_self_declared'
  )),
  ADD COLUMN IF NOT EXISTS data_source TEXT,
  ADD COLUMN IF NOT EXISTS last_verified DATE;
-- expected_attendance INTEGER already exists on pacific_events — not re-added.

-- pacific_tourism_stats: add provenance columns not already present.
ALTER TABLE pacific_tourism_stats
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'curated' CHECK (source_type IN (
    'curated', 'provider_self_listed', 'hybrid'
  )),
  ADD COLUMN IF NOT EXISTS data_confidence TEXT DEFAULT 'curated_unverified' CHECK (data_confidence IN (
    'verified', 'curated_unverified', 'provider_self_declared'
  )),
  ADD COLUMN IF NOT EXISTS data_source TEXT,
  ADD COLUMN IF NOT EXISTS last_verified DATE;


-- ============================================================================
-- STEP 2 — NEW TABLES (created in FK-dependency order)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE 1: tourism_destinations — one row per nation
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_destinations (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code                     TEXT NOT NULL UNIQUE,
  nation_name                     TEXT NOT NULL,
  region                          TEXT NOT NULL DEFAULT 'pacific_island' CHECK (region IN (
                                    'pacific_island', 'pacific_rim', 'global'
                                  )),
  island_groups                   TEXT[],
  capital_city                    TEXT,
  timezone                        TEXT,
  currency_code                   TEXT,
  currency_name                   TEXT,
  official_languages               TEXT[],
  spoken_languages                 TEXT[],
  population                       INTEGER,
  land_area_km2                    NUMERIC(10,2),

  -- Entry requirements (visa)
  visa_on_arrival                   TEXT[],
  visa_free                         TEXT[],
  evisa_available                   BOOLEAN DEFAULT FALSE,
  evisa_url                         TEXT,
  visa_notes                        TEXT,

  -- Climate
  best_season_start                 TEXT,
  best_season_end                   TEXT,
  wet_season_start                  TEXT,
  wet_season_end                    TEXT,
  cyclone_season_start              TEXT,
  cyclone_season_end                TEXT,
  avg_temp_wet_c                    NUMERIC(4,1),
  avg_temp_dry_c                    NUMERIC(4,1),
  cyclone_risk_rating                TEXT CHECK (cyclone_risk_rating IN (
                                       'low', 'medium', 'high', 'very_high'
                                     )),

  -- Gaming
  casino_legal_status               TEXT CHECK (casino_legal_status IN (
                                       'licensed_permitted', 'restricted',
                                       'prohibited', 'unknown'
                                     )),
  casino_venue_count                 INTEGER DEFAULT 0,
  casino_regulatory_body             TEXT,
  casino_notes                       TEXT,

  -- Film and media
  survivor_seasons                   TEXT[],
  notable_productions                TEXT[],
  film_location_tourism_available      BOOLEAN DEFAULT FALSE,
  drone_rules                         TEXT CHECK (drone_rules IN (
                                        'permit_required', 'prohibited',
                                        'restricted_zones', 'no_restrictions', 'unknown'
                                      )),
  drone_permit_authority               TEXT,
  drone_notes                          TEXT,
  photography_restrictions              TEXT,

  -- UNESCO and protected sites
  unesco_sites                         TEXT[],
  nationally_protected_sites            TEXT[],

  -- Travel advisories (linked, not live — refresh manually)
  dfat_advisory_level                   TEXT,
  dfat_advisory_url                     TEXT,
  nz_safetravel_level                   TEXT,
  us_state_dept_level                   TEXT,
  advisory_last_checked                 DATE,

  -- Connectivity summary
  tap_water_safe                        BOOLEAN,
  tap_water_notes                       TEXT,
  power_outlet_types                    TEXT[],
  voltage_v                             INTEGER,
  mobile_coverage_summary                TEXT,
  avg_internet_speed_mbps                 NUMERIC(6,2),
  digital_nomad_suitability_rating         INTEGER CHECK (digital_nomad_suitability_rating BETWEEN 1 AND 5),

  -- Source metadata
  source_type                           TEXT NOT NULL DEFAULT 'curated' CHECK (source_type IN (
                                          'curated', 'provider_self_listed', 'hybrid'
                                        )),
  data_confidence                       TEXT NOT NULL DEFAULT 'curated_unverified' CHECK (data_confidence IN (
                                          'verified', 'curated_unverified', 'provider_self_declared'
                                        )),
  data_source                           TEXT,
  last_verified                         DATE,
  created_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NFT stubs — inert, do not reference in any function
  nft_destination_token_issued           BOOLEAN DEFAULT FALSE,
  nft_destination_token_id               TEXT
);

-- ----------------------------------------------------------------------------
-- TABLE 2: tourism_providers — master registration record
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_providers (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id                  UUID REFERENCES providers(id) ON DELETE SET NULL,
  business_name                TEXT NOT NULL,
  legal_entity_name             TEXT,
  provider_category             TEXT NOT NULL CHECK (provider_category IN (
                                  'accommodation', 'tour_operator',
                                  'water_activities', 'transport',
                                  'food_beverage', 'conference_events',
                                  'local_guide'
                                )),
  nation_code                   TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  island                         TEXT,
  town_or_area                   TEXT,
  street_address                  TEXT,
  lat                             NUMERIC(9,6),
  lng                              NUMERIC(9,6),
  contact_email                     TEXT,
  contact_phone                     TEXT,
  website_url                       TEXT,
  facebook_url                      TEXT,
  instagram_url                     TEXT,
  languages_spoken                   TEXT[],
  years_operating                    INTEGER,
  locally_owned                      BOOLEAN DEFAULT TRUE,
  eco_certified                      BOOLEAN DEFAULT FALSE,
  eco_certification_name              TEXT,
  certifications_held                 TEXT[],
  insurance_held                      BOOLEAN DEFAULT FALSE,
  registration_fee_paid                BOOLEAN DEFAULT FALSE,
  registration_fee_amount              NUMERIC(10,2),
  registration_fee_currency            TEXT DEFAULT 'USD',
  registration_fee_paid_at             TIMESTAMPTZ,
  registration_payment_method          TEXT CHECK (registration_payment_method IN (
                                          'usdc_algorand', 'stripe', 'waived'
                                        )),
  verification_status                  TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
                                          'pending', 'verified', 'rejected', 'suspended'
                                        )),
  verification_notes                   TEXT,
  verified_at                          TIMESTAMPTZ,
  verified_by                          TEXT,
  endpoint_id                          UUID REFERENCES endpoints(id) ON DELETE SET NULL,
  trust_tier                           TEXT DEFAULT 'community',
  source_type                          TEXT NOT NULL DEFAULT 'provider_self_listed' CHECK (source_type IN (
                                          'curated', 'provider_self_listed', 'hybrid'
                                        )),
  data_confidence                      TEXT NOT NULL DEFAULT 'provider_self_declared' CHECK (data_confidence IN (
                                          'verified', 'curated_unverified', 'provider_self_declared'
                                        )),
  created_at                           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NFT stubs — inert
  nft_provider_token_issued             BOOLEAN DEFAULT FALSE,
  nft_provider_token_id                 TEXT,
  nft_discount_active                   BOOLEAN DEFAULT FALSE,
  nft_discount_percentage                NUMERIC(5,2),
  local_resident_rate_available           BOOLEAN DEFAULT FALSE,
  local_resident_rate_notes               TEXT,
  loyalty_program_active                  BOOLEAN DEFAULT FALSE,
  tiptide_wallet_connected                BOOLEAN DEFAULT FALSE,
  tiptide_wallet_address                  TEXT
);

-- ----------------------------------------------------------------------------
-- TABLE 3: tourism_accommodations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_accommodations (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tourism_provider_id               UUID REFERENCES tourism_providers(id) ON DELETE CASCADE,
  nation_code                       TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  property_name                     TEXT NOT NULL,
  property_type                     TEXT NOT NULL CHECK (property_type IN (
                                      'hotel', 'resort', 'guesthouse', 'beach_fale',
                                      'homestay', 'overwater_bungalow', 'villa',
                                      'backpacker_hostel', 'boutique_hotel',
                                      'eco_lodge', 'motel'
                                    )),
  star_rating_official                 NUMERIC(2,1) CHECK (
    star_rating_official BETWEEN 0.5 AND 5.0
  ),
  star_rating_self_declared             NUMERIC(2,1) CHECK (
    star_rating_self_declared BETWEEN 0.5 AND 5.0
  ),
  star_rating_certifying_body           TEXT,
  international_chain                   TEXT,
  is_independent_boutique                BOOLEAN DEFAULT FALSE,

  -- Room inventory
  room_count_total                       INTEGER,
  room_count_standard                    INTEGER,
  room_count_deluxe                      INTEGER,
  room_count_suite                       INTEGER,
  room_count_overwater                   INTEGER,
  room_count_fale_bure                   INTEGER,
  room_count_villa                       INTEGER,
  room_count_accessible                  INTEGER,
  price_budget_min_usd                   NUMERIC(10,2),
  price_budget_max_usd                   NUMERIC(10,2),
  price_midrange_min_usd                 NUMERIC(10,2),
  price_midrange_max_usd                 NUMERIC(10,2),
  price_luxury_min_usd                   NUMERIC(10,2),
  price_luxury_max_usd                   NUMERIC(10,2),
  price_peak_multiplier                  NUMERIC(4,2) DEFAULT 1.0,
  peak_season_notes                      TEXT,

  -- Facilities
  has_pool                               BOOLEAN DEFAULT FALSE,
  pool_count                             INTEGER DEFAULT 0,
  pool_types                             TEXT[], -- freshwater, saltwater, adults_only, swim_up_bar, infinity, kids
  has_spa                                BOOLEAN DEFAULT FALSE,
  spa_services                           TEXT[],
  spa_local_treatments_available          BOOLEAN DEFAULT FALSE,
  has_gym                                BOOLEAN DEFAULT FALSE,
  has_kids_club                          BOOLEAN DEFAULT FALSE,
  has_water_sports_hire                   BOOLEAN DEFAULT FALSE,
  has_currency_exchange                   BOOLEAN DEFAULT FALSE,
  has_laundry                             BOOLEAN DEFAULT FALSE,
  has_airport_transfer                    BOOLEAN DEFAULT FALSE,
  airport_transfer_type                    TEXT CHECK (airport_transfer_type IN (
                                             'included', 'fee', 'not_available'
                                           )),
  airport_transfer_cost_usd                NUMERIC(10,2),

  -- Dining
  has_restaurant                           BOOLEAN DEFAULT FALSE,
  restaurant_open_to_nonguests               BOOLEAN DEFAULT FALSE,
  restaurant_cuisine_types                   TEXT[],
  restaurant_dining_tier                     TEXT CHECK (restaurant_dining_tier IN (
                                               'casual', 'mid_range', 'fine_dining',
                                               'buffet', 'beach_bbq', 'multiple'
                                             )),
  restaurant_traditional_dishes               TEXT[],
  restaurant_dietary_options                  TEXT[],
  restaurant_signature_cocktails              TEXT[],
  restaurant_local_spirits                    TEXT[],
  restaurant_kava_available                   BOOLEAN DEFAULT FALSE,
  restaurant_byo_permitted                    BOOLEAN DEFAULT FALSE,
  restaurant_alcohol_licence                  BOOLEAN DEFAULT FALSE,
  restaurant_rating_source                    TEXT,
  restaurant_rating_score                     NUMERIC(3,1) CHECK (
    restaurant_rating_score BETWEEN 0 AND 10
  ),
  has_bar                                     BOOLEAN DEFAULT FALSE,
  bar_types                                   TEXT[], -- beachfront, swim_up, rooftop, sports_bar
  happy_hour_times                            TEXT,

  -- Casino
  has_casino                                  BOOLEAN DEFAULT FALSE,
  casino_type                                 TEXT CHECK (casino_type IN (
                                                'slots_only', 'table_games',
                                                'full_gaming_floor', 'poker_room'
                                              )),
  casino_gaming_hours                         TEXT,
  casino_dress_code                           TEXT,
  casino_minimum_age                          INTEGER,

  -- Conference and events
  has_conference_facilities                   BOOLEAN DEFAULT FALSE,
  conference_max_capacity_theatre              INTEGER,
  conference_max_capacity_banquet              INTEGER,
  conference_max_capacity_classroom            INTEGER,
  conference_breakout_rooms                   INTEGER DEFAULT 0,
  conference_av_standard                      TEXT CHECK (conference_av_standard IN (
                                                'basic', 'standard', 'full_av', 'broadcast'
                                              )),
  conference_catering_inhouse                 BOOLEAN DEFAULT FALSE,
  conference_outdoor_space                    BOOLEAN DEFAULT FALSE,
  conference_outdoor_capacity                 INTEGER,
  largest_event_hosted                        TEXT,

  -- Wedding
  is_wedding_venue                            BOOLEAN DEFAULT FALSE,
  wedding_ceremony_types                      TEXT[], -- symbolic, legally_binding, traditional, beach
  wedding_beach_permit_held                   BOOLEAN DEFAULT FALSE,
  wedding_traditional_elements                TEXT[],
  wedding_honeymoon_packages                  BOOLEAN DEFAULT FALSE,
  wedding_vow_renewal_available                BOOLEAN DEFAULT FALSE,
  wedding_planner_inhouse                      BOOLEAN DEFAULT FALSE,

  -- Accessibility
  has_accessible_rooms                         BOOLEAN DEFAULT FALSE,
  accessible_room_count                        INTEGER DEFAULT 0,
  accessible_beach_entry                       BOOLEAN DEFAULT FALSE,
  accessible_pool_entry                        BOOLEAN DEFAULT FALSE,
  wheelchair_pathways                          BOOLEAN DEFAULT FALSE,
  accessibility_notes                          TEXT,

  -- Proximity (km)
  distance_to_town_km                          NUMERIC(6,2),
  drive_time_to_town_min                       INTEGER,
  distance_to_airport_km                       NUMERIC(6,2),
  drive_time_to_airport_min                    INTEGER,
  distance_to_market_km                        NUMERIC(6,2),
  distance_to_hospital_km                      NUMERIC(6,2),
  distance_to_pharmacy_km                      NUMERIC(6,2),
  distance_to_atm_km                           NUMERIC(6,2),
  distance_to_supermarket_km                   NUMERIC(6,2),
  distance_to_ferry_terminal_km                NUMERIC(6,2),
  distance_to_domestic_airport_km              NUMERIC(6,2),
  year_round_road_access                       BOOLEAN DEFAULT TRUE,
  fourwd_required                              BOOLEAN DEFAULT FALSE,

  -- Source metadata
  source_type                                  TEXT NOT NULL DEFAULT 'curated' CHECK (source_type IN (
                                                 'curated', 'provider_self_listed', 'hybrid'
                                               )),
  data_confidence                              TEXT NOT NULL DEFAULT 'curated_unverified' CHECK (data_confidence IN (
                                                 'verified', 'curated_unverified', 'provider_self_declared'
                                               )),
  data_source                                  TEXT,
  last_verified                                DATE,
  created_at                                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NFT stubs — inert
  nft_discount_active                          BOOLEAN DEFAULT FALSE,
  nft_discount_percentage                      NUMERIC(5,2),
  local_resident_rate_available                BOOLEAN DEFAULT FALSE,
  local_resident_rate_notes                    TEXT,
  loyalty_program_active                       BOOLEAN DEFAULT FALSE
);

-- ----------------------------------------------------------------------------
-- TABLE 4: tourism_activities
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_activities (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tourism_provider_id             UUID REFERENCES tourism_providers(id) ON DELETE SET NULL,
  nation_code                     TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  island                           TEXT,
  location_name                    TEXT NOT NULL,
  activity_type                    TEXT NOT NULL CHECK (activity_type IN (
                                     'dive_site', 'snorkel_site', 'surf_break',
                                     'whale_watching', 'cultural', 'hiking',
                                     'fishing_charter', 'water_sport', 'day_trip',
                                     'out_to_island', 'market_tour',
                                     'village_immersion', 'cooking_class',
                                     'craft_workshop', 'film_location',
                                     'birdwatching', 'caving', 'cycling',
                                     'horse_riding', 'fiafia_night',
                                     'kava_ceremony', 'church_visit',
                                     'historical_site', 'archaeological_site',
                                     'private_island_hire', 'sandbar_excursion',
                                     'whale_swim', 'sport_fishing',
                                     'windsurfing', 'kitesurfing', 'kayaking',
                                     'paddleboard', 'parasailing', 'glassbottom_boat',
                                     'waterfall', 'blue_hole', 'volcano_tour'
                                   )),
  activity_name                    TEXT NOT NULL,
  description                      TEXT,
  lat                               NUMERIC(9,6),
  lng                               NUMERIC(9,6),

  -- Skill and access
  skill_level                       TEXT CHECK (skill_level IN (
                                      'beginner', 'intermediate', 'advanced',
                                      'expert', 'all_levels', 'guided_only'
                                    )),
  certification_required             BOOLEAN DEFAULT FALSE,
  certification_type                 TEXT[], -- open_water, advanced, rescue, technical, padi, ssi, naui
  minimum_age                        INTEGER,
  maximum_group_size                 INTEGER,
  minimum_group_size                 INTEGER DEFAULT 1,
  accessibility_rating                INTEGER CHECK (accessibility_rating BETWEEN 1 AND 5),
  accessible_options_available         BOOLEAN DEFAULT FALSE,

  -- Season and conditions
  season_start                        TEXT,
  season_end                          TEXT,
  year_round                          BOOLEAN DEFAULT FALSE,
  best_time_notes                     TEXT,
  water_temp_min_c                    NUMERIC(4,1),
  water_temp_max_c                    NUMERIC(4,1),
  visibility_min_m                    INTEGER,
  visibility_max_m                    INTEGER,
  depth_min_m                         NUMERIC(6,1),
  depth_max_m                         NUMERIC(6,1),
  current_rating                      TEXT CHECK (current_rating IN (
                                        'none', 'mild', 'moderate', 'strong', 'variable'
                                      )),

  -- Marine and natural highlights
  marine_life_highlights               TEXT[],
  natural_highlights                   TEXT[],
  coral_health_status                  TEXT CHECK (coral_health_status IN (
                                         'excellent', 'good', 'moderate',
                                         'degraded', 'recovering', 'unknown'
                                       )),
  reef_coordinate_lat                  NUMERIC(9,6),
  -- NOAA CoralTemp grid resolution is 0.05 degrees.
  -- Phase B Worker must use approximate matching, not
  -- equality join. Pattern:
  -- WHERE ABS(reef_coordinate_lat - noaa_lat) < 0.025
  -- AND ABS(reef_coordinate_lng - noaa_lng) < 0.025
  reef_coordinate_lng                  NUMERIC(9,6),
  -- See reef_coordinate_lat note above.

  -- Pricing
  price_min_usd                        NUMERIC(10,2),
  price_max_usd                        NUMERIC(10,2),
  price_per                            TEXT CHECK (price_per IN (
                                         'person', 'group', 'vessel', 'day', 'half_day'
                                       )),
  price_includes                       TEXT[],
  equipment_hire_available              BOOLEAN DEFAULT FALSE,
  equipment_hire_cost_usd               NUMERIC(10,2),

  -- Hazard flags
  has_marine_hazards                   BOOLEAN DEFAULT FALSE,
  marine_hazard_types                  TEXT[],
  has_current_risk                     BOOLEAN DEFAULT FALSE,
  current_risk_notes                   TEXT,
  has_shark_activity                   BOOLEAN DEFAULT FALSE,
  shark_risk_level                     TEXT CHECK (shark_risk_level IN (
                                         'low', 'medium', 'high', 'critical'
                                       )),

  -- Film and media
  survivor_connection                  BOOLEAN DEFAULT FALSE,
  survivor_notes                       TEXT,
  other_production_connection          TEXT,

  -- Source metadata
  source_type                          TEXT NOT NULL DEFAULT 'curated' CHECK (source_type IN (
                                         'curated', 'provider_self_listed', 'hybrid'
                                       )),
  data_confidence                      TEXT NOT NULL DEFAULT 'curated_unverified' CHECK (data_confidence IN (
                                         'verified', 'curated_unverified', 'provider_self_declared'
                                       )),
  data_source                          TEXT,
  last_verified                        DATE,
  created_at                           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- TABLE 5: tourism_food_beverage
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_food_beverage (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tourism_provider_id           UUID REFERENCES tourism_providers(id) ON DELETE SET NULL,
  nation_code                   TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  venue_name                     TEXT NOT NULL,
  venue_type                     TEXT NOT NULL CHECK (venue_type IN (
                                   'restaurant', 'bar', 'cafe', 'market_stall',
                                   'food_tour', 'catering_service',
                                   'kava_bar', 'night_market', 'food_truck',
                                   'hotel_restaurant', 'beach_bar'
                                 )),
  cuisine_types                   TEXT[],
  dining_tier                     TEXT CHECK (dining_tier IN (
                                    'street_food', 'casual', 'mid_range',
                                    'fine_dining', 'buffet', 'multiple'
                                  )),
  traditional_dishes               TEXT[],
  dietary_options                  TEXT[],
  signature_cocktails              TEXT[],
  local_spirits_featured            TEXT[],
  kava_available                   BOOLEAN DEFAULT FALSE,
  kava_type                        TEXT CHECK (kava_type IN (
                                     'ceremonial', 'social', 'tourist_adapted'
                                   )),
  locally_sourced_ingredients       BOOLEAN DEFAULT FALSE,
  seafood_speciality                BOOLEAN DEFAULT FALSE,
  byo_permitted                     BOOLEAN DEFAULT FALSE,
  alcohol_licence                   BOOLEAN DEFAULT FALSE,
  rating_source                     TEXT,
  rating_score                      NUMERIC(3,1) CHECK (
    rating_score BETWEEN 0 AND 10
  ),
  price_per_person_min_usd          NUMERIC(10,2),
  price_per_person_max_usd          NUMERIC(10,2),
  seating_capacity                  INTEGER,
  reservations_required             BOOLEAN DEFAULT FALSE,
  delivery_available                BOOLEAN DEFAULT FALSE,
  catering_for_events                BOOLEAN DEFAULT FALSE,
  catering_max_capacity              INTEGER,
  operating_hours                    JSONB,
  -- Expected structure (enforced at application layer in Phase B):
  -- {
  --   "monday":    {"open": "07:00", "close": "22:00", "closed": false},
  --   "tuesday":   {"open": "07:00", "close": "22:00", "closed": false},
  --   "wednesday": {"open": "07:00", "close": "22:00", "closed": false},
  --   "thursday":  {"open": "07:00", "close": "22:00", "closed": false},
  --   "friday":    {"open": "07:00", "close": "22:00", "closed": false},
  --   "saturday":  {"open": "07:00", "close": "22:00", "closed": false},
  --   "sunday":    {"open": null,    "close": null,    "closed": true}
  -- }
  -- Phase B endpoint must validate this structure on write.
  distance_to_tourist_area_km        NUMERIC(6,2),
  parking_available                  BOOLEAN DEFAULT FALSE,
  accessibility_notes                TEXT,
  source_type                        TEXT NOT NULL DEFAULT 'curated' CHECK (source_type IN (
                                       'curated', 'provider_self_listed', 'hybrid'
                                     )),
  data_confidence                    TEXT NOT NULL DEFAULT 'curated_unverified' CHECK (data_confidence IN (
                                       'verified', 'curated_unverified', 'provider_self_declared'
                                     )),
  data_source                        TEXT,
  last_verified                      DATE,
  created_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NFT stubs — inert
  nft_discount_active                BOOLEAN DEFAULT FALSE,
  nft_discount_percentage            NUMERIC(5,2),
  local_resident_rate_available       BOOLEAN DEFAULT FALSE,
  local_resident_rate_notes           TEXT
);

-- ----------------------------------------------------------------------------
-- TABLE 6: tourism_transport
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_transport (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tourism_provider_id         UUID REFERENCES tourism_providers(id) ON DELETE SET NULL,
  nation_code                 TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  transport_type               TEXT NOT NULL CHECK (transport_type IN (
                                 'ferry', 'domestic_airline', 'inter_island_transfer',
                                 'airport_transfer', 'car_hire', 'boat_charter',
                                 'water_taxi', 'helicopter', 'seaplane'
                               )),
  operator_name                 TEXT NOT NULL,
  origin                        TEXT NOT NULL,
  destination                   TEXT NOT NULL,
  origin_nation_code             TEXT,
  destination_nation_code        TEXT,
  frequency                     TEXT CHECK (frequency IN (
                                   'multiple_daily', 'daily', 'several_weekly',
                                   'weekly', 'fortnightly', 'monthly',
                                   'seasonal', 'on_demand'
                                 )),
  schedule_notes                 TEXT,
  duration_minutes               INTEGER,
  price_min_usd                  NUMERIC(10,2),
  price_max_usd                  NUMERIC(10,2),
  booking_method                 TEXT[], -- online, phone, in_person, agent
  booking_url                    TEXT,
  vessel_or_aircraft_type         TEXT,
  passenger_capacity              INTEGER,
  luggage_allowance_kg            NUMERIC(6,1),
  accessibility_features          TEXT[],
  safety_certification            TEXT,
  safety_certification_body       TEXT,
  reliability_notes               TEXT,
  source_type                     TEXT NOT NULL DEFAULT 'curated' CHECK (source_type IN (
                                    'curated', 'provider_self_listed', 'hybrid'
                                  )),
  data_confidence                 TEXT NOT NULL DEFAULT 'curated_unverified' CHECK (data_confidence IN (
                                    'verified', 'curated_unverified', 'provider_self_declared'
                                  )),
  data_source                     TEXT,
  last_verified                   DATE,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- TABLE 7: tourism_hazards
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_hazards (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code             TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  island                   TEXT,
  location_name             TEXT,
  lat                       NUMERIC(9,6),
  lng                       NUMERIC(9,6),
  hazard_type               TEXT NOT NULL CHECK (hazard_type IN (
                              'riptide', 'jellyfish', 'box_jellyfish',
                              'shark', 'stonefish', 'cone_snail',
                              'crocodile', 'crown_of_thorns',
                              'strong_current', 'cyclone', 'tsunami',
                              'flood', 'volcanic', 'earthquake',
                              'dengue', 'malaria', 'zika',
                              'uv_extreme', 'unsafe_water', 'mosquito',
                              'sea_urchin', 'coral_cuts', 'sunburn'
                            )),
  risk_level                 TEXT NOT NULL CHECK (risk_level IN (
                               'low', 'medium', 'high', 'critical'
                             )),
  season_or_period            TEXT,
  specific_notes              TEXT,
  mitigation_advice            TEXT,
  is_seasonal                  BOOLEAN DEFAULT FALSE,
  season_start_month           INTEGER,
  season_end_month             INTEGER,
  source_of_data               TEXT,
  source_url                   TEXT,
  -- IMPORTANT: Honiara decompression chamber and similar critical safety
  -- data must be curated_unverified until human confirmation — see
  -- intelligence report §1.12 for flagged items.
  data_confidence               TEXT NOT NULL DEFAULT 'curated_unverified' CHECK (data_confidence IN (
                                  'verified', 'curated_unverified', 'provider_self_declared'
                                )),
  last_verified                 DATE,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- TABLE 8: tourism_health_infrastructure
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_health_infrastructure (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code                       TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  island                             TEXT,
  facility_name                      TEXT NOT NULL,
  facility_type                      TEXT NOT NULL CHECK (facility_type IN (
                                       'hospital_surgical', 'clinic_basic',
                                       'pharmacy', 'decompression_chamber',
                                       'dental', 'evacuation_service',
                                       'blood_bank', 'health_centre'
                                     )),
  lat                                 NUMERIC(9,6),
  lng                                 NUMERIC(9,6),
  address                             TEXT,
  contact_phone                      TEXT,
  contact_email                      TEXT,
  operating_hours                    TEXT,
  is_24_hour                         BOOLEAN DEFAULT FALSE,
  services_available                 TEXT[],
  has_surgical_capacity               BOOLEAN DEFAULT FALSE,
  has_blood_bank                     BOOLEAN DEFAULT FALSE,
  has_evacuation_capability           BOOLEAN DEFAULT FALSE,
  evacuation_destinations             TEXT[],
  distance_to_main_tourist_area_km     NUMERIC(6,2),
  cost_consultation_usd               NUMERIC(10,2),
  cost_emergency_usd                  NUMERIC(10,2),
  cost_hospitalisation_per_night_usd   NUMERIC(10,2),
  cost_evacuation_estimate_usd        NUMERIC(10,2),
  cost_hyperbaric_treatment_usd       NUMERIC(10,2),
  travel_insurance_required           BOOLEAN DEFAULT FALSE,
  travel_insurance_recommended         BOOLEAN DEFAULT TRUE,
  notes                               TEXT,
  data_confidence                     TEXT NOT NULL DEFAULT 'curated_unverified' CHECK (data_confidence IN (
                                        'verified', 'curated_unverified', 'provider_self_declared'
                                      )),
  data_source                         TEXT,
  last_verified                       DATE,
  created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- TABLE 9: tourism_cultural_protocols — one row per nation
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_cultural_protocols (
  id                                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code                         TEXT NOT NULL UNIQUE REFERENCES tourism_destinations(nation_code),
  dress_code_general                  TEXT,
  dress_code_sites                    TEXT[],
  sacred_sites_with_rules              JSONB, -- [{name, location, rules, photo_permitted}]
  photography_restrictions_general     TEXT,
  photography_restricted_locations     TEXT[],
  sunday_restrictions                  TEXT,
  religious_day_restrictions           TEXT,
  village_visit_protocol               TEXT,
  gift_giving_customs                  TEXT,
  kava_ceremony_protocol               TEXT,
  church_visit_etiquette               TEXT,
  taboo_behaviours                     TEXT[],
  traditional_greetings                TEXT,
  appropriate_dress_men                TEXT,
  appropriate_dress_women              TEXT,
  removal_of_shoes_required            BOOLEAN DEFAULT FALSE,
  removal_of_shoes_notes               TEXT,
  protocol_overrides                   JSONB, -- site-specific rules that differ from the national norm
  source_type                          TEXT NOT NULL DEFAULT 'curated' CHECK (source_type IN (
                                         'curated', 'provider_self_listed', 'hybrid'
                                       )),
  data_confidence                      TEXT NOT NULL DEFAULT 'curated_unverified' CHECK (data_confidence IN (
                                         'verified', 'curated_unverified', 'provider_self_declared'
                                       )),
  data_source                          TEXT,
  last_verified                        DATE,
  created_at                           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- TABLE 10: tourism_markets
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_markets (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tourism_provider_id           UUID REFERENCES tourism_providers(id) ON DELETE SET NULL,
  nation_code                   TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  market_name                   TEXT NOT NULL,
  island                         TEXT,
  town                           TEXT,
  lat                             NUMERIC(9,6),
  lng                             NUMERIC(9,6),
  market_type                    TEXT NOT NULL CHECK (market_type IN (
                                   'produce', 'craft', 'fish', 'mixed',
                                   'flea', 'night_market', 'farmers_market'
                                 )),
  operating_days                  TEXT[], -- monday through sunday, public_holiday
  opening_time                    TIME,
  closing_time                    TIME,
  payment_accepted                 TEXT CHECK (payment_accepted IN (
                                     'cash_only', 'card', 'both'
                                   )),
  is_covered                       BOOLEAN DEFAULT FALSE,
  distance_to_tourist_area_km      NUMERIC(6,2),
  signature_products               TEXT[],
  guided_tours_available           BOOLEAN DEFAULT FALSE,
  guided_tour_operator             TEXT,
  guided_tour_price_usd            NUMERIC(10,2),
  parking_available                BOOLEAN DEFAULT FALSE,
  accessibility_notes               TEXT,
  best_visit_time_notes             TEXT,
  source_type                       TEXT NOT NULL DEFAULT 'curated' CHECK (source_type IN (
                                      'curated', 'provider_self_listed', 'hybrid'
                                    )),
  data_confidence                   TEXT NOT NULL DEFAULT 'curated_unverified' CHECK (data_confidence IN (
                                      'verified', 'curated_unverified', 'provider_self_declared'
                                    )),
  data_source                       TEXT,
  last_verified                     DATE,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- TABLE 11: tourism_weddings — one row per nation
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_weddings (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code                      TEXT NOT NULL UNIQUE REFERENCES tourism_destinations(nation_code),
  residency_waiting_days            INTEGER,
  documents_required                TEXT[],
  application_lead_time_weeks       INTEGER,
  legally_binding_available          BOOLEAN DEFAULT FALSE,
  legally_binding_notes             TEXT,
  symbolic_only_available            BOOLEAN DEFAULT FALSE,
  celebrant_requirements             TEXT,
  beach_permit_required              BOOLEAN DEFAULT FALSE,
  beach_permit_authority             TEXT,
  beach_permit_cost_usd              NUMERIC(10,2),
  beach_permit_lead_time_weeks       INTEGER,
  traditional_elements_available     TEXT[],
  licensed_wedding_planners          TEXT[],
  honeymoon_packages_available        BOOLEAN DEFAULT FALSE,
  vow_renewal_available               BOOLEAN DEFAULT FALSE,
  same_sex_marriage_legal             BOOLEAN,
  -- MANUAL VERIFICATION REQUIRED before populating.
  -- None of the 13 current Pacific island nations legally
  -- recognise same-sex marriage. Several criminalise
  -- homosexuality (WS, TO, PG, KI, SB, CK).
  -- Populate only after confirmed legal source per
  -- jurisdiction. Never auto-populate or infer.
  -- Field remains nullable. data_confidence must be
  -- 'verified' before any value is published.
  same_sex_marriage_notes             TEXT,
  additional_notes                    TEXT,
  data_confidence                     TEXT NOT NULL DEFAULT 'curated_unverified' CHECK (data_confidence IN (
                                        'verified', 'curated_unverified', 'provider_self_declared'
                                      )),
  data_source                         TEXT,
  last_verified                       DATE,
  created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- TABLE 12: tourism_accessibility — one row per nation
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_accessibility (
  id                                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code                           TEXT NOT NULL UNIQUE REFERENCES tourism_destinations(nation_code),
  accessible_beaches                    TEXT[],
  accessible_snorkel_entry_points         TEXT[],
  adaptive_dive_operators                TEXT[],
  accessible_transport_options            TEXT[],
  accessible_cultural_experiences         TEXT[],
  accommodation_accessibility_rating       INTEGER CHECK (accommodation_accessibility_rating BETWEEN 1 AND 5),
  overall_accessibility_maturity           INTEGER CHECK (overall_accessibility_maturity BETWEEN 1 AND 5),
  accessibility_notes                      TEXT,
  data_confidence                          TEXT NOT NULL DEFAULT 'curated_unverified' CHECK (data_confidence IN (
                                             'verified', 'curated_unverified', 'provider_self_declared'
                                           )),
  data_source                              TEXT,
  last_verified                            DATE,
  created_at                               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- TABLE 13: tourism_conference_venues — standalone conference/events venues
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tourism_conference_venues (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tourism_provider_id             UUID REFERENCES tourism_providers(id) ON DELETE SET NULL,
  nation_code                     TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  venue_name                       TEXT NOT NULL,
  venue_type                       TEXT NOT NULL CHECK (venue_type IN (
                                     'dedicated_conference_centre',
                                     'community_venue', 'church_hall',
                                     'outdoor_event_space', 'government_venue',
                                     'university_venue', 'sports_venue'
                                   )),
  island                             TEXT,
  lat                                 NUMERIC(9,6),
  lng                                 NUMERIC(9,6),
  capacity_theatre                    INTEGER,
  capacity_banquet                    INTEGER,
  capacity_classroom                  INTEGER,
  capacity_cocktail                   INTEGER,
  capacity_outdoor                    INTEGER,
  breakout_rooms                      INTEGER DEFAULT 0,
  av_standard                         TEXT CHECK (av_standard IN (
                                        'none', 'basic', 'standard',
                                        'full_av', 'broadcast'
                                      )),
  natural_light                       BOOLEAN DEFAULT FALSE,
  inhouse_catering                    BOOLEAN DEFAULT FALSE,
  external_catering_permitted          BOOLEAN DEFAULT TRUE,
  branding_options                    BOOLEAN DEFAULT FALSE,
  technical_support_onsite             BOOLEAN DEFAULT FALSE,
  parking_capacity                    INTEGER,
  accommodation_nearby                 TEXT,
  price_full_day_usd                   NUMERIC(10,2),
  price_half_day_usd                   NUMERIC(10,2),
  price_per_head_usd                   NUMERIC(10,2),
  largest_event_hosted                 TEXT,
  accessibility_notes                  TEXT,
  source_type                          TEXT NOT NULL DEFAULT 'curated' CHECK (source_type IN (
                                         'curated', 'provider_self_listed', 'hybrid'
                                       )),
  data_confidence                      TEXT NOT NULL DEFAULT 'curated_unverified' CHECK (data_confidence IN (
                                         'verified', 'curated_unverified', 'provider_self_declared'
                                       )),
  data_source                          TEXT,
  last_verified                        DATE,
  created_at                           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- STEP 3 — INDEXES
-- ============================================================================

-- Nation-code lookups (most common query pattern)
CREATE INDEX idx_tourism_destinations_nation_code ON tourism_destinations(nation_code);
CREATE INDEX idx_tourism_destinations_region ON tourism_destinations(region);
CREATE INDEX idx_tourism_accommodations_nation_code ON tourism_accommodations(nation_code);
CREATE INDEX idx_tourism_accommodations_property_type ON tourism_accommodations(property_type);
CREATE INDEX idx_tourism_activities_nation_code ON tourism_activities(nation_code);
CREATE INDEX idx_tourism_activities_activity_type ON tourism_activities(activity_type);
CREATE INDEX idx_tourism_activities_reef_coords ON tourism_activities(reef_coordinate_lat, reef_coordinate_lng);
CREATE INDEX idx_tourism_hazards_nation_code ON tourism_hazards(nation_code);
CREATE INDEX idx_tourism_hazards_type ON tourism_hazards(hazard_type);
CREATE INDEX idx_tourism_hazards_risk_level ON tourism_hazards(risk_level);
CREATE INDEX idx_tourism_providers_nation_code ON tourism_providers(nation_code);
CREATE INDEX idx_tourism_providers_category ON tourism_providers(provider_category);
CREATE INDEX idx_tourism_providers_verification ON tourism_providers(verification_status);
CREATE INDEX idx_tourism_food_beverage_nation_code ON tourism_food_beverage(nation_code);
CREATE INDEX idx_tourism_transport_nation_code ON tourism_transport(nation_code);
CREATE INDEX idx_tourism_transport_type ON tourism_transport(transport_type);
CREATE INDEX idx_tourism_markets_nation_code ON tourism_markets(nation_code);
CREATE INDEX idx_tourism_conference_venues_nation_code ON tourism_conference_venues(nation_code);

-- Source and confidence filtering
CREATE INDEX idx_tourism_providers_source_type ON tourism_providers(source_type);
CREATE INDEX idx_tourism_accommodations_confidence ON tourism_accommodations(data_confidence);
CREATE INDEX idx_tourism_hazards_confidence ON tourism_hazards(data_confidence);

-- NFT stub indexes (inert now, ready for TipTide integration build)
CREATE INDEX idx_tourism_providers_nft_active ON tourism_providers(nft_discount_active);
CREATE INDEX idx_tourism_accommodations_nft_active ON tourism_accommodations(nft_discount_active);


-- ============================================================================
-- STEP 4 — SEED NATION REFERENCE ROWS (13 nations only — no other data seeded)
-- ============================================================================

INSERT INTO tourism_destinations (
  nation_code, nation_name, region, source_type, data_confidence, data_source,
  created_at, updated_at
) VALUES
  ('WS', 'Samoa', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW()),
  ('TO', 'Tonga', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW()),
  ('FJ', 'Fiji', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW()),
  ('VU', 'Vanuatu', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW()),
  ('CK', 'Cook Islands', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW()),
  ('NU', 'Niue', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW()),
  ('PW', 'Palau', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW()),
  ('PF', 'French Polynesia', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW()),
  ('SB', 'Solomon Islands', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW()),
  ('MH', 'Marshall Islands', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW()),
  ('FM', 'Federated States of Micronesia', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW()),
  ('KI', 'Kiribati', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW()),
  ('PG', 'Papua New Guinea', 'pacific_island', 'curated', 'curated_unverified', 'PDC seed — verify against intelligence report before publish', NOW(), NOW());


-- ============================================================================
-- STEP 5 — ROW LEVEL SECURITY
-- See finding #7 above: public SELECT for anon+authenticated; INSERT for
-- authenticated only; UPDATE for service_role only. DELETE is intentionally
-- excluded from all explicit policies — authenticated users cannot delete
-- tourism records through the frontend. service_role bypasses RLS entirely
-- regardless of policy coverage, so it can still UPDATE or DELETE directly.
-- ============================================================================

ALTER TABLE tourism_destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_destinations_public_read" ON tourism_destinations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_destinations_authenticated_insert" ON tourism_destinations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_destinations_service_write" ON tourism_destinations FOR UPDATE TO service_role USING (true) WITH CHECK (true);

ALTER TABLE tourism_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_providers_public_read" ON tourism_providers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_providers_authenticated_insert" ON tourism_providers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_providers_service_write" ON tourism_providers FOR UPDATE TO service_role USING (true) WITH CHECK (true);

ALTER TABLE tourism_accommodations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_accommodations_public_read" ON tourism_accommodations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_accommodations_authenticated_insert" ON tourism_accommodations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_accommodations_service_write" ON tourism_accommodations FOR UPDATE TO service_role USING (true) WITH CHECK (true);

ALTER TABLE tourism_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_activities_public_read" ON tourism_activities FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_activities_authenticated_insert" ON tourism_activities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_activities_service_write" ON tourism_activities FOR UPDATE TO service_role USING (true) WITH CHECK (true);

ALTER TABLE tourism_food_beverage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_food_beverage_public_read" ON tourism_food_beverage FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_food_beverage_authenticated_insert" ON tourism_food_beverage FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_food_beverage_service_write" ON tourism_food_beverage FOR UPDATE TO service_role USING (true) WITH CHECK (true);

ALTER TABLE tourism_transport ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_transport_public_read" ON tourism_transport FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_transport_authenticated_insert" ON tourism_transport FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_transport_service_write" ON tourism_transport FOR UPDATE TO service_role USING (true) WITH CHECK (true);

ALTER TABLE tourism_hazards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_hazards_public_read" ON tourism_hazards FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_hazards_authenticated_insert" ON tourism_hazards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_hazards_service_write" ON tourism_hazards FOR UPDATE TO service_role USING (true) WITH CHECK (true);

ALTER TABLE tourism_health_infrastructure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_health_infrastructure_public_read" ON tourism_health_infrastructure FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_health_infrastructure_authenticated_insert" ON tourism_health_infrastructure FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_health_infrastructure_service_write" ON tourism_health_infrastructure FOR UPDATE TO service_role USING (true) WITH CHECK (true);

ALTER TABLE tourism_cultural_protocols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_cultural_protocols_public_read" ON tourism_cultural_protocols FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_cultural_protocols_authenticated_insert" ON tourism_cultural_protocols FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_cultural_protocols_service_write" ON tourism_cultural_protocols FOR UPDATE TO service_role USING (true) WITH CHECK (true);

ALTER TABLE tourism_markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_markets_public_read" ON tourism_markets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_markets_authenticated_insert" ON tourism_markets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_markets_service_write" ON tourism_markets FOR UPDATE TO service_role USING (true) WITH CHECK (true);

ALTER TABLE tourism_weddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_weddings_public_read" ON tourism_weddings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_weddings_authenticated_insert" ON tourism_weddings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_weddings_service_write" ON tourism_weddings FOR UPDATE TO service_role USING (true) WITH CHECK (true);

ALTER TABLE tourism_accessibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_accessibility_public_read" ON tourism_accessibility FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_accessibility_authenticated_insert" ON tourism_accessibility FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_accessibility_service_write" ON tourism_accessibility FOR UPDATE TO service_role USING (true) WITH CHECK (true);

ALTER TABLE tourism_conference_venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_conference_venues_public_read" ON tourism_conference_venues FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_conference_venues_authenticated_insert" ON tourism_conference_venues FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tourism_conference_venues_service_write" ON tourism_conference_venues FOR UPDATE TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- STEP 6 — UPDATED_AT TRIGGERS
-- Reuses the existing shared update_updated_at() function (defined in
-- session1_migration.sql) — see finding #6 above. Not redefined here.
-- ============================================================================

CREATE TRIGGER tourism_destinations_updated_at
  BEFORE UPDATE ON tourism_destinations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tourism_providers_updated_at
  BEFORE UPDATE ON tourism_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tourism_accommodations_updated_at
  BEFORE UPDATE ON tourism_accommodations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tourism_activities_updated_at
  BEFORE UPDATE ON tourism_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tourism_food_beverage_updated_at
  BEFORE UPDATE ON tourism_food_beverage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tourism_transport_updated_at
  BEFORE UPDATE ON tourism_transport
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tourism_hazards_updated_at
  BEFORE UPDATE ON tourism_hazards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tourism_health_infrastructure_updated_at
  BEFORE UPDATE ON tourism_health_infrastructure
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tourism_cultural_protocols_updated_at
  BEFORE UPDATE ON tourism_cultural_protocols
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tourism_markets_updated_at
  BEFORE UPDATE ON tourism_markets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tourism_weddings_updated_at
  BEFORE UPDATE ON tourism_weddings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tourism_accessibility_updated_at
  BEFORE UPDATE ON tourism_accessibility
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tourism_conference_venues_updated_at
  BEFORE UPDATE ON tourism_conference_venues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================================
-- ROLLBACK
-- Run everything below manually, in this order, to fully revert this
-- migration. Not executed automatically.
-- ============================================================================

-- 1) Drop triggers on new tables
-- DROP TRIGGER IF EXISTS tourism_conference_venues_updated_at ON tourism_conference_venues;
-- DROP TRIGGER IF EXISTS tourism_accessibility_updated_at ON tourism_accessibility;
-- DROP TRIGGER IF EXISTS tourism_weddings_updated_at ON tourism_weddings;
-- DROP TRIGGER IF EXISTS tourism_markets_updated_at ON tourism_markets;
-- DROP TRIGGER IF EXISTS tourism_cultural_protocols_updated_at ON tourism_cultural_protocols;
-- DROP TRIGGER IF EXISTS tourism_health_infrastructure_updated_at ON tourism_health_infrastructure;
-- DROP TRIGGER IF EXISTS tourism_hazards_updated_at ON tourism_hazards;
-- DROP TRIGGER IF EXISTS tourism_transport_updated_at ON tourism_transport;
-- DROP TRIGGER IF EXISTS tourism_food_beverage_updated_at ON tourism_food_beverage;
-- DROP TRIGGER IF EXISTS tourism_activities_updated_at ON tourism_activities;
-- DROP TRIGGER IF EXISTS tourism_accommodations_updated_at ON tourism_accommodations;
-- DROP TRIGGER IF EXISTS tourism_providers_updated_at ON tourism_providers;
-- DROP TRIGGER IF EXISTS tourism_destinations_updated_at ON tourism_destinations;

-- 2) Drop indexes on new tables
-- DROP INDEX IF EXISTS idx_tourism_accommodations_nft_active;
-- DROP INDEX IF EXISTS idx_tourism_providers_nft_active;
-- DROP INDEX IF EXISTS idx_tourism_hazards_confidence;
-- DROP INDEX IF EXISTS idx_tourism_accommodations_confidence;
-- DROP INDEX IF EXISTS idx_tourism_providers_source_type;
-- DROP INDEX IF EXISTS idx_tourism_conference_venues_nation_code;
-- DROP INDEX IF EXISTS idx_tourism_markets_nation_code;
-- DROP INDEX IF EXISTS idx_tourism_transport_type;
-- DROP INDEX IF EXISTS idx_tourism_transport_nation_code;
-- DROP INDEX IF EXISTS idx_tourism_food_beverage_nation_code;
-- DROP INDEX IF EXISTS idx_tourism_providers_verification;
-- DROP INDEX IF EXISTS idx_tourism_providers_category;
-- DROP INDEX IF EXISTS idx_tourism_providers_nation_code;
-- DROP INDEX IF EXISTS idx_tourism_hazards_risk_level;
-- DROP INDEX IF EXISTS idx_tourism_hazards_type;
-- DROP INDEX IF EXISTS idx_tourism_hazards_nation_code;
-- DROP INDEX IF EXISTS idx_tourism_activities_reef_coords;
-- DROP INDEX IF EXISTS idx_tourism_activities_activity_type;
-- DROP INDEX IF EXISTS idx_tourism_activities_nation_code;
-- DROP INDEX IF EXISTS idx_tourism_accommodations_property_type;
-- DROP INDEX IF EXISTS idx_tourism_accommodations_nation_code;
-- DROP INDEX IF EXISTS idx_tourism_destinations_region;
-- DROP INDEX IF EXISTS idx_tourism_destinations_nation_code;

-- 3) Drop policies on new tables (each table carries _public_read,
--    _authenticated_insert, _service_write — see Fix 1 revision)
-- DROP POLICY IF EXISTS "tourism_destinations_public_read" ON tourism_destinations;
-- DROP POLICY IF EXISTS "tourism_destinations_authenticated_insert" ON tourism_destinations;
-- DROP POLICY IF EXISTS "tourism_destinations_service_write" ON tourism_destinations;
-- DROP POLICY IF EXISTS "tourism_providers_public_read" ON tourism_providers;
-- DROP POLICY IF EXISTS "tourism_providers_authenticated_insert" ON tourism_providers;
-- DROP POLICY IF EXISTS "tourism_providers_service_write" ON tourism_providers;
-- DROP POLICY IF EXISTS "tourism_accommodations_public_read" ON tourism_accommodations;
-- DROP POLICY IF EXISTS "tourism_accommodations_authenticated_insert" ON tourism_accommodations;
-- DROP POLICY IF EXISTS "tourism_accommodations_service_write" ON tourism_accommodations;
-- DROP POLICY IF EXISTS "tourism_activities_public_read" ON tourism_activities;
-- DROP POLICY IF EXISTS "tourism_activities_authenticated_insert" ON tourism_activities;
-- DROP POLICY IF EXISTS "tourism_activities_service_write" ON tourism_activities;
-- DROP POLICY IF EXISTS "tourism_food_beverage_public_read" ON tourism_food_beverage;
-- DROP POLICY IF EXISTS "tourism_food_beverage_authenticated_insert" ON tourism_food_beverage;
-- DROP POLICY IF EXISTS "tourism_food_beverage_service_write" ON tourism_food_beverage;
-- DROP POLICY IF EXISTS "tourism_transport_public_read" ON tourism_transport;
-- DROP POLICY IF EXISTS "tourism_transport_authenticated_insert" ON tourism_transport;
-- DROP POLICY IF EXISTS "tourism_transport_service_write" ON tourism_transport;
-- DROP POLICY IF EXISTS "tourism_hazards_public_read" ON tourism_hazards;
-- DROP POLICY IF EXISTS "tourism_hazards_authenticated_insert" ON tourism_hazards;
-- DROP POLICY IF EXISTS "tourism_hazards_service_write" ON tourism_hazards;
-- DROP POLICY IF EXISTS "tourism_health_infrastructure_public_read" ON tourism_health_infrastructure;
-- DROP POLICY IF EXISTS "tourism_health_infrastructure_authenticated_insert" ON tourism_health_infrastructure;
-- DROP POLICY IF EXISTS "tourism_health_infrastructure_service_write" ON tourism_health_infrastructure;
-- DROP POLICY IF EXISTS "tourism_cultural_protocols_public_read" ON tourism_cultural_protocols;
-- DROP POLICY IF EXISTS "tourism_cultural_protocols_authenticated_insert" ON tourism_cultural_protocols;
-- DROP POLICY IF EXISTS "tourism_cultural_protocols_service_write" ON tourism_cultural_protocols;
-- DROP POLICY IF EXISTS "tourism_markets_public_read" ON tourism_markets;
-- DROP POLICY IF EXISTS "tourism_markets_authenticated_insert" ON tourism_markets;
-- DROP POLICY IF EXISTS "tourism_markets_service_write" ON tourism_markets;
-- DROP POLICY IF EXISTS "tourism_weddings_public_read" ON tourism_weddings;
-- DROP POLICY IF EXISTS "tourism_weddings_authenticated_insert" ON tourism_weddings;
-- DROP POLICY IF EXISTS "tourism_weddings_service_write" ON tourism_weddings;
-- DROP POLICY IF EXISTS "tourism_accessibility_public_read" ON tourism_accessibility;
-- DROP POLICY IF EXISTS "tourism_accessibility_authenticated_insert" ON tourism_accessibility;
-- DROP POLICY IF EXISTS "tourism_accessibility_service_write" ON tourism_accessibility;
-- DROP POLICY IF EXISTS "tourism_conference_venues_public_read" ON tourism_conference_venues;
-- DROP POLICY IF EXISTS "tourism_conference_venues_authenticated_insert" ON tourism_conference_venues;
-- DROP POLICY IF EXISTS "tourism_conference_venues_service_write" ON tourism_conference_venues;

-- 4) Drop tables in reverse FK order
-- DROP TABLE IF EXISTS tourism_accessibility;
-- DROP TABLE IF EXISTS tourism_weddings;
-- DROP TABLE IF EXISTS tourism_conference_venues;
-- DROP TABLE IF EXISTS tourism_markets;
-- DROP TABLE IF EXISTS tourism_cultural_protocols;
-- DROP TABLE IF EXISTS tourism_health_infrastructure;
-- DROP TABLE IF EXISTS tourism_hazards;
-- DROP TABLE IF EXISTS tourism_food_beverage;
-- DROP TABLE IF EXISTS tourism_transport;
-- DROP TABLE IF EXISTS tourism_activities;
-- DROP TABLE IF EXISTS tourism_accommodations;
-- DROP TABLE IF EXISTS tourism_providers;
-- DROP TABLE IF EXISTS tourism_destinations;

-- 5) update_updated_at() function — NOT dropped. It was not created by this
--    migration; it is the existing shared function from session1_migration.sql,
--    reused by pacific_events, endpoint_deployments, institutions, and
--    deployment_invoices. Dropping it would break those tables' triggers too.

-- 6) Rollback ALTER TABLE statements on pacific_events and pacific_tourism_stats
-- ALTER TABLE pacific_events DROP COLUMN IF EXISTS event_category;
-- ALTER TABLE pacific_events DROP COLUMN IF EXISTS is_tourist_friendly;
-- ALTER TABLE pacific_events DROP COLUMN IF EXISTS ticket_price_min;
-- ALTER TABLE pacific_events DROP COLUMN IF EXISTS ticket_price_max;
-- ALTER TABLE pacific_events DROP COLUMN IF EXISTS ticket_currency;
-- ALTER TABLE pacific_events DROP COLUMN IF EXISTS booking_url;
-- ALTER TABLE pacific_events DROP COLUMN IF EXISTS data_confidence;
-- ALTER TABLE pacific_events DROP COLUMN IF EXISTS data_source;
-- ALTER TABLE pacific_events DROP COLUMN IF EXISTS last_verified;
-- (expected_attendance was NOT added by this migration — do not drop it here.)

-- ALTER TABLE pacific_tourism_stats DROP COLUMN IF EXISTS source_type;
-- ALTER TABLE pacific_tourism_stats DROP COLUMN IF EXISTS data_confidence;
-- ALTER TABLE pacific_tourism_stats DROP COLUMN IF EXISTS data_source;
-- ALTER TABLE pacific_tourism_stats DROP COLUMN IF EXISTS last_verified;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
