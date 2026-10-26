-- Phase C — adds 6 new water-activity values to tourism_activities.activity_type,
-- requested for the water_activities dropdown after PR #193 review.
--
-- Of the 10 originally requested (scuba_diving, freediving, snorkelling,
-- surfing, whale_watching, kayaking, paddleboarding, kitesurfing,
-- beach_tour, lagoon_tour), whale_watching/kayaking/kitesurfing already
-- existed and were omitted (would be no-op duplicates in the IN() list).
-- paddleboarding was dropped per approval — the dropdown now displays
-- "Paddleboarding" as the label for the existing paddleboard value instead
-- of adding a second, near-duplicate value (see
-- lib/tourism/activityTypes.ts's WATER_ACTIVITY_OPTIONS).
--
-- APPLIED via Supabase MCP on 2026-10-26, same session, after explicit
-- approval. This file documents the already-applied change for repo/DB
-- parity. Constraint name confirmed live via pg_constraint before dropping
-- (tourism_activities_activity_type_check — Postgres's default name for
-- the unnamed inline CHECK in Phase A's CREATE TABLE).

ALTER TABLE tourism_activities DROP CONSTRAINT tourism_activities_activity_type_check;
ALTER TABLE tourism_activities ADD CONSTRAINT tourism_activities_activity_type_check
  CHECK (activity_type IN (
    'dive_site','snorkel_site','surf_break','whale_watching','cultural','hiking',
    'fishing_charter','water_sport','day_trip','out_to_island','market_tour',
    'village_immersion','cooking_class','craft_workshop','film_location','birdwatching',
    'caving','cycling','horse_riding','fiafia_night','kava_ceremony','church_visit',
    'historical_site','archaeological_site','private_island_hire','sandbar_excursion',
    'whale_swim','sport_fishing','windsurfing','kitesurfing','kayaking','paddleboard',
    'parasailing','glassbottom_boat','waterfall','blue_hole','volcano_tour',
    'scuba_diving','freediving','snorkelling','surfing','beach_tour','lagoon_tour'
  ));
