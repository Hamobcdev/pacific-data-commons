-- Phase B tourism endpoints — GoPlausible Bazaar registration prep.
--
-- Inserts 21 rows into public.endpoints for the Phase B tourism routes
-- (apps/directory-api/src/routeSchemas.ts), one per route. This reverses
-- the prior Phase B hold on GoPlausible registration (see routeSchemas.ts
-- diff, same change set) — explicitly approved.
--
-- provider_id reuses the existing first-party SBP provider row
-- (23688689-502a-437d-939b-3288d8292534, institution_name "Pacific Data
-- Commons — SBP Platform Demonstration"), the same provider_id already
-- used by other first-party Decision 59-class endpoints (e.g. /finance/fx)
-- — confirmed live before writing this, not assumed.
--
-- pricing_tiers uses the 2-field {path, price_usdc} shape per explicit
-- approval, even though other rows in this table (e.g. /finance/fx) use a
-- richer 5-field shape (name, path, tier, price_usdc, description) —
-- flagged at approval time, kept as approved.
--
-- Parameterised paths keep the literal :nation_code placeholder as
-- approved — these rows are not yet payable as-is by canary_x402_seed.py;
-- resolving "one row per route" vs "one row per nation" is a separate,
-- later decision.
--
-- APPLIED via Supabase MCP on 2026-10-26, same session, after explicit
-- approval. This file documents the already-applied change for repo/DB
-- parity.

INSERT INTO public.endpoints
  (provider_id, endpoint_url, data_category, title, description, pricing_tiers, is_active, goplausible_registered, human_deliverable)
VALUES
  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Destination Full Profile',
   'Full tourism_destinations profile for one nation, plus LEFT-JOIN counts of its registered accommodations/activities/providers. Includes source_type and data_confidence. 404 if nation_code not found.',
   '[{"path": "/tourism/destination/:nation_code", "price_usdc": 0.10}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — All Destinations',
   'Lightweight list of all tourism_destinations rows for a region (default pacific_island), ordered by nation_name. Optional ?fields= (comma-separated column subset) to request large array columns excluded by default.',
   '[{"path": "/tourism/destinations/pacific", "price_usdc": 0.10}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Destination Minimal Profile',
   'Minimal destination profile (nation_code, nation_name, capital_city, currency_code, timezone, best_season_start/end, cyclone_risk_rating, tap_water_safe, data_confidence) for agent routing decisions where the full payload is not needed. 404 if nation_code not found.',
   '[{"path": "/tourism/destination/:nation_code/profile", "price_usdc": 0.10}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Travel Advisories',
   'Travel advisory fields only (DFAT, NZ SafeTravel, US State Dept levels, advisory_last_checked, data_confidence) for one nation. Advisory levels are manually refreshed, never live-fetched — see the response''s own advisory_data_warning.',
   '[{"path": "/tourism/destination/:nation_code/advisories", "price_usdc": 0.10}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Accommodation by Nation',
   'tourism_accommodations for one nation, filterable by property_type, price band, pool/spa/conference/casino/wedding-venue flags, star_rating_min, source_type. ?limit= (default 20, max 100), ?offset=. Includes source_type and data_confidence per record, plus totalCount.',
   '[{"path": "/tourism/accommodation/:nation_code", "price_usdc": 0.25}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Conference-Capable Accommodation',
   'tourism_accommodations with has_conference_facilities=true for one nation — capacity, AV standard, catering, outdoor space, distance to airport, data_confidence.',
   '[{"path": "/tourism/accommodation/:nation_code/conferences", "price_usdc": 0.25}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Activities by Nation',
   'tourism_activities for one nation, filterable by activity_type, skill_level, season, max_price_usd, certification_required, accessible, source_type. ?limit= (default 20, max 100), ?offset=. reef_coordinate_lat/lng are present on dive_site/snorkel_site rows — the join key for the coral bleaching endpoint (approximate matching only, never exact coordinate equality).',
   '[{"path": "/tourism/activities/:nation_code", "price_usdc": 0.25}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Dive & Snorkel Sites',
   'Full dive/snorkel site data for one nation (depth, visibility, water temp, current, certification, marine life, coral health, hazards, Survivor filming connections). Includes a coral_bleaching_join_hint describing the approximate reef_coordinate_lat/lng match (within 0.025 degrees of NOAA CoralTemp''s 0.05-degree grid) against /intelligence/coral-bleaching — never exact coordinate equality.',
   '[{"path": "/tourism/dive/:nation_code", "price_usdc": 0.50}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Cultural Activities',
   'tourism_activities restricted to cultural activity types (cultural, fiafia_night, kava_ceremony, church_visit, village_immersion, cooking_class, craft_workshop, historical_site, archaeological_site) for one nation — full description, season dates, pricing, group sizes, accessibility.',
   '[{"path": "/tourism/cultural/:nation_code", "price_usdc": 0.25}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Safety Hazards',
   'tourism_hazards for one nation, filterable by hazard_type, risk_level, island, ordered critical-risk first. data_confidence is CRITICAL here — see the response''s own safety_data_warning: curated_unverified unless explicitly marked verified, always confirm with local authorities.',
   '[{"path": "/tourism/hazards/:nation_code", "price_usdc": 0.50}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Health Infrastructure',
   'tourism_health_infrastructure for one nation (hospitals, clinics, decompression chambers, evacuation services), filterable by facility_type, has_surgical_capacity, has_evacuation_capability. Includes cost estimates where available, travel_insurance_recommended, data_confidence, and the same safety_data_warning as /tourism/hazards.',
   '[{"path": "/tourism/health/:nation_code", "price_usdc": 0.50}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Cultural Protocols',
   'Full tourism_cultural_protocols row (one per nation) — dress codes, sacred site rules, photography restrictions, village visit/kava ceremony/church visit etiquette, taboo behaviours, protocol_overrides JSONB, data_confidence. 404 if no protocol data exists for that nation yet — many nations are gaps initially.',
   '[{"path": "/tourism/protocols/:nation_code", "price_usdc": 0.50}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Food & Beverage',
   'tourism_food_beverage for one nation, filterable by venue_type, cuisine_type, dietary, dining_tier, kava_available, max_price_per_person, source_type. ?limit= (default 20, max 100), ?offset=. Includes operating_hours JSONB, nft_discount_active stub (always false), source_type, data_confidence per record, plus totalCount.',
   '[{"path": "/tourism/food/:nation_code", "price_usdc": 0.25}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Markets',
   'tourism_markets for one nation, filterable by market_type and day (matched against operating_days). Includes opening/closing time, payment_accepted, signature_products, distance_to_tourist_area_km, data_confidence.',
   '[{"path": "/tourism/markets/:nation_code", "price_usdc": 0.25}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Transport by Nation',
   'tourism_transport for one nation, filterable by transport_type and frequency, ordered by transport_type then operator_name. Includes data_confidence per record.',
   '[{"path": "/tourism/transport/:nation_code", "price_usdc": 0.10}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Transport Route Search',
   'tourism_transport records where either required ?origin= or ?destination= (nation_code or city name) matches any of origin/destination/origin_nation_code/destination_nation_code. Includes data_confidence per record.',
   '[{"path": "/tourism/transport/routes", "price_usdc": 0.10}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Events by Nation',
   'pacific_events for one nation (country_code match), filterable by event_category, from_date/to_date, is_tourist_friendly (default true). Includes ticket_price_min/max, ticket_currency, booking_url, data_confidence, ordered by start_date ascending.',
   '[{"path": "/tourism/events/:nation_code", "price_usdc": 0.10}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Christmas & New Year Events',
   'All pacific_events across every Pacific nation where event_category=christmas_new_year or start_date falls in the Dec 15 – Jan 5 seasonal window, grouped by nation_code (nation_name included per group). Priced above the standard events lookup for high Q4 agent demand.',
   '[{"path": "/tourism/events/pacific/christmas", "price_usdc": 0.25}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Cross-Nation Search',
   'Cross-nation tourism search: destination filter first (nation_code/region) determines the matched nation set, then accommodation and activity queries scoped to those nations with the remaining filters (activity_type/diving/surfing/whale_watching/cultural/season/max_budget_per_day_usd/group_size/has_casino/has_conference/has_wedding_venue/accessibility_required/source_type). Returns matched destinations/accommodations/activities, a critical/high hazard summary (max 3 per nation), and data_confidence/source_type summaries. Hard-capped at 10 nations and 50 records per sub-array. Requires at least one query parameter — 400 otherwise.',
   '[{"path": "/tourism/search", "price_usdc": 1.00}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Verified Providers',
   'tourism_providers for one nation, filterable by provider_category and verification_status (default verified). ?limit= (default 20, max 100), ?offset=. Includes source_type and data_confidence per record, plus totalCount.',
   '[{"path": "/tourism/providers/:nation_code", "price_usdc": 0.10}]'::jsonb, true, false, false),

  ('23688689-502a-437d-939b-3288d8292534', 'https://api.synergybcpacific.com', 'tourism',
   'Pacific Tourism — Wedding Requirements & Venues',
   'Full tourism_weddings row (residency/documents/legal-binding status/beach permit requirements) for one nation, plus up to 5 tourism_accommodations rows flagged is_wedding_venue=true, ordered by star_rating_official descending. 404 if nation_code is not in tourism_destinations; 200 with wedding_requirements=null and wedding_venues=[] if the nation exists but has no curated wedding data yet (see the response''s own wedding_data_status and legal_data_warning fields).',
   '[{"path": "/tourism/weddings/:nation_code", "price_usdc": 0.25}]'::jsonb, true, false, false);
