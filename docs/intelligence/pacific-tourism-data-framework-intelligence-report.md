# Pacific Tourism Data Framework — Intelligence Report

**Date:** 2026-10-26
**Scope:** Research and architecture brief for a new PDC endpoint category (`data_category = 'tourism'`, already a valid enum value in `endpoints.data_category` — see §0.2). Deliverable feeds a Supabase migration, a set of Cloudflare Worker routes in `apps/directory-api`, and a Next.js provider registration form.
**Method:** Live web research this session (cited inline) + established domain knowledge (flagged `〜 GENERAL KNOWLEDGE — VERIFY`) + direct inspection of the existing PDC codebase and schema. Per CLAUDE.md P9, nothing here should become live endpoint content, legal copy, or safety-critical claims without human verification against the cited primary source immediately before publish — data in this domain (gaming law, malaria zones, decompression chamber uptime, volcanic alert levels) changes on a timescale of months, not years.

**Confidence key used throughout:**
- ✅ **VERIFIED THIS SESSION** — confirmed via live web search on 2026-10-26, source cited
- 〜 **GENERAL KNOWLEDGE** — stable, low-risk fact (geography, timezone, language), high confidence, not independently re-verified this session
- ❌ **GAP** — no reliable public source found; provider self-listing is the only realistic path
- ⚠️ **VOLATILE / RE-VERIFY BEFORE PUBLISH** — true as of this session but changes on a short timescale (advisory levels, volcanic alerts, chamber operational status, gaming law proposals)

---

## 0. Orientation — What Already Exists in PDC

Before designing anything new, two things in the current codebase matter directly to this build:

**0.1 — A tourism orchestrator demo already exists and should be extended, not duplicated.**
`supabase/migrations/session32_pacific_events.sql` created `pacific_events` (festivals, sport, cultural, religious, political, business events — 7 nations seeded: WS, FJ, TO, PG, SB, VU, CK) and `session34_pacific_tourism_stats.sql` created `pacific_tourism_stats` (World Bank/SPTO annual arrivals, receipts, seasonality — same 7 nations). These back `GET /intelligence/pacific-travel` (`apps/directory-api/src/routes/intelligence/pacific-travel.ts`) and `GET /pacific/events`. This framework's `tourism_events` table (§2, Table 6) should **absorb `pacific_events`** (same shape, broader category enum, all 13 nations) rather than create a parallel table — a migration should rename/extend `pacific_events` into `tourism_events`, not leave both live. `pacific_tourism_stats` should become a `source_type = 'curated'` feed into `tourism_destinations` (§2, Table 1), not a separate top-level concept.

**0.2 — `tourism` is already a valid `data_category` on the `endpoints` table.** `session1_migration.sql`'s `endpoints.data_category` CHECK constraint already includes `'tourism'` as a valid value (confirmed by direct read of the migration). No schema change is needed to register a tourism endpoint — only new content-tables and new rows in the existing `endpoints`/`providers` tables.

**0.3 — Existing join points this framework must connect to (confirmed live in codebase):**
| Existing asset | Path | Query shape | Relevance to tourism |
|---|---|---|---|
| Coral bleaching | `GET /climate/pacific-coral-bleaching` | `lat`, `lon`, `radius_deg` (decimal degrees, NOT a country code) | Join key for dive/snorkel/reef data is **geographic coordinates**, not `nation_code`. See §3.12. |
| Ocean temperature | `GET /climate/ocean-temperature` | lat/lon-based | Same join pattern — dive site water-temp fields should query this live rather than storing a static value. |
| Cyclone history | `apps/directory-api/src/routes/climate/pacificCycloneHistory.ts` | — | Join point for `tourism_hazards` cyclone rows — do not re-derive cyclone history independently. |
| FX rates | `GET /finance/fx` | `from`, `to`, `amount`, `base`, `pairs`, `pacific_only` | Already carries WST, FJD, TOP, VUV, XPF, PGK, SBD + AUD/USD/NZD. Accommodation/activity pricing agents should call this, not store converted prices. See §3.13. |
| Pacific events | `pacific_events` table, `GET /pacific/events` | `country_code`, date range | Predecessor to `tourism_events` — migrate, don't duplicate. |
| Tourism stats | `pacific_tourism_stats` table | `country_code`, `year` | Predecessor feed for `tourism_destinations` arrivals/seasonality fields. |
| Providers / endpoints / trust tier | `providers`, `endpoints` tables | — | `providers.trust_tier` (`bronze`/`silver`/`gold`) is the existing trust-tier column — **there is no separate `trust_tiers` table in this codebase.** §2's Table 12 design corrects the brief's implicit assumption of one. |

---

## PART 1 — DATA SOURCE RESEARCH

### 1.0 Primary Source Catalog

| Organisation | URL | Offers | Machine-readable? | Update frequency | Licensing / access |
|---|---|---|---|---|---|
| Pacific Tourism Organisation (SPTO, rebranded from "South Pacific Tourism Organisation") | southpacificislands.travel ✅ | Visitor arrivals, cruise arrivals, visitor surveys, employment surveys, market intelligence, PSTIF sustainability indicators (launched 2022) | **No public API found.** Delivered as PDF reports and a dashboard (southpacificislands.travel/home/research/pacific-tourism-dashboard) and the "RTRC" (Regional Tourism Resource Centre, spto.org/resources/rtrc) — ✅ verified this session; RTRC appears to be a browsable portal, not a documented REST/CSV API | Quarterly (Visitor Arrivals Snapshot) / annual (Annual Report) | Intergovernmental body — **a data-sharing agreement or formal data request is the realistic path to bulk structured data**, not scraping. Treat as curated/manually-transcribed source, re-verified quarterly. |
| SPC — Pacific Community | spc.int | Demographics, health, fisheries (already a PDC source for `fisheries`/`demographics` categories per existing endpoints) | Mixed — SPC's PopGIS and statistical portals vary by dataset | Varies | Regional intergovernmental body — same posture as SPTO: request access, don't scrape. |
| National tourism authorities (Samoa Tourism Authority, Tourism Fiji, Vanuatu Tourism Office, Cook Islands Tourism, PNG Tourism Promotion Authority, Tonga Tourism, Tourism Solomons, Palau Visitors Authority, Tahiti Tourisme, Visit Marshall Islands, Kiribati Tourism, Niue Tourism) | varies per nation | Destination profiles, operator directories, events calendars | Almost universally **marketing websites, not APIs** — HTML only | Varies, often stale | No consistent licensing terms published; treat each as a manually-curated source with its own `last_verified` date (per Part 2 schema requirement). This is the single largest "requires manual curation, not scraping" category in the whole framework. |
| IATA route/fare data | iata.org | Scheduled routes, fares | Behind commercial data-licensing products (Direct Data Solutions etc.) | — | **Licensing cost almost certainly exceeds what a Tier-1 ($0.01) endpoint can recover.** Recommend: either skip IATA entirely and curate route/airline lists manually from airline timetables (free, public), or treat fare *ranges* as self-declared/estimated rather than IATA-sourced. Flag for Decision Register. |
| PADI / SSI / NAUI operator directories | padi.com, divessi.com, naui.org | "Find a dive center" locator pages | HTML directory pages, not documented public APIs | Operator-maintained, ad hoc | Listing in these directories is the dive shop's own commercial relationship with PADI/SSI/NAUI — PDC has no licence to re-publish their directory data wholesale. **Correct approach: dive operators self-list via the Water Activities provider form (§4.3) and self-declare which certification body they hold; PDC does not scrape PADI's locator.** |
| TripAdvisor / Google Places | — | Reviews, ratings, place data | APIs exist (Google Places API) but both have **explicit ToS restrictions on data caching, bulk re-display, and re-selling** that are in direct tension with an x402-gated resale model | — | ⚠️ **Legally ambiguous — do not scrape TripAdvisor.** Google Places API's terms generally prohibit storing results beyond a short cache TTL and prohibit using Places data to build a competing directory product, which is close to what PDC's tourism directory *is*. Recommend: do not ingest either as a backing data source for paid endpoints. Provider self-declared ratings + the PDC Silver/Gold trust tier (Decision 7) is the compliant substitute — see §5 for the explicit flag. |
| NOAA Coral Reef Watch | — | Already live in PDC (§0.3) | ✅ Yes, ERDDAP CSV | Daily | Public domain (US Government work) — already cleared by the existing endpoint's own sourcing doc comment. |
| WHO Western Pacific / WHO travel health | who.int | Malaria/dengue/vaccination advisories | Published as reports/pages, not a structured API | Periodic | Public, attributable. Verified this session for malaria (see §1.11). |
| DFAT Smartraveller / UK FCDO / US State Dept / NZ SafeTravel | smartraveller.gov.au, gov.uk, travel.state.gov, safetravel.govt.nz | Current advisory level per country | **No of the four publishes a clean public JSON API** for programmatic consumption at time of research — travel.state.gov and smartraveller.gov.au are HTML pages designed for scraping resistance (dynamic rendering) | Updated irregularly, sometimes same-day | Public information, but advisory *levels* are the single most volatile fact in this entire report — see §1.19's recommendation to treat this as a live-fetched or frequently-re-scraped field with a short cache TTL, never a static seed. |
| OpenStreetMap / Nominatim | openstreetmap.org, nominatim.openstreetmap.org | Place geocoding, POI data | ✅ Yes, Overpass API + Nominatim API | Continuously edited | ✅ Verified this session: **ODbL licence** — commercial use is permitted with attribution ("© OpenStreetMap contributors"), but the public Nominatim server is capped at **1 request/second** and its usage policy warns heavy/commercial use should run on self-hosted or commercial infrastructure, not the volunteer server. **Recommend:** self-host a Nominatim instance or use a commercial geocoding provider (Mapbox, Geoapify) for anything beyond light/dev-time lookups; do not point production proximity-field computation at the public Nominatim endpoint. |
| Pacific Civil Aviation Authorities (CAAF Fiji, CAAV Vanuatu, CASA-equivalents per nation) | varies | Drone regulation, airport data | HTML pages, drone-registration portals | — | Public regulatory information — safe to curate manually, re-verify annually (regulations change — Fiji's CAAF registration system is reasonably current as of this session, see §1.1). |
| Ferry operators per nation | varies, often no website at all (Solomon Islands, Kiribati, FSM) | Schedules, pricing | Almost entirely **not machine-readable**; several nations have no operator website | — | ❌ **Largest structural gap in the entire framework.** See §1.4 and §5. |
| World Bank | data.worldbank.org | Tourism arrivals (`ST.INT.ARVL`), GDP, tourism receipts | ✅ Yes, documented REST API (already used elsewhere in this repo per `oracle-api-structure-probe-2026-10-21.md`) | Annual | Public domain/CC-BY, already a proven integration pattern in this codebase. |
| UNESCO World Heritage Centre | whc.unesco.org | World Heritage Site list and boundaries | Has a documented list/XML export | Updated as sites are added (rare) | Public, attributable. See §1.1 for the verified current Pacific list. |
| Film commissions | Fiji Film, PNG, few others have one | Filming location records, incentive info | HTML, inconsistent | — | Fiji has an active Film Fiji commission; most other nations in scope do not have a dedicated film office. Survivor/film location data is better sourced from public production records (Wikipedia-documented season locations, verified §1.1) than from film-commission databases, which mostly don't exist for this purpose. |

### 1.1 Destination Profile — Per-Nation Findings

| Nation | Code | Timezone | Currency | Languages | Visa posture (AU/NZ/US/UK/EU typically) | UNESCO sites | Gaming status | Survivor/film history | Drone rules |
|---|---|---|---|---|---|---|---|---|---|
| Samoa | WS | UTC+13 | Tala (WST) | Samoan, English | Visa-free/visa-on-arrival for most incl. AU/NZ/US 〜 GENERAL KNOWLEDGE | None confirmed | ✅ **Legal.** Casino and Gambling Control Act 2010; Gaming Control Act 2017 updated the framework. Gambling Control Authority (GCA) regulates. **Locals barred** — only foreign-passport holders staying at a casino resort/hotel may play. Whitesands Casino and BlackSands Casino are operating properties 〜 GENERAL KNOWLEDGE on names, ✅ verified the legal/foreign-only structure. | ✅ **US Survivor seasons 19, 20, 23, 24 filmed on Upolu** (Survivor: Samoa and subsequent re-uses of the same camp). | Permit **required even for recreational flying** — WST $100 fee, apply ≥7 working days ahead, by email to the relevant aviation authority. ✅ |
| Tonga | TO | UTC+13 | Pa'anga (TOP) | Tongan, English | Visa-free for most incl. AU/NZ/US, typically 31 days 〜 | None confirmed | ✅ **Illegal.** Criminal Offences Act criminalises all commercial gambling (casinos, lotteries, internet gambling) as of 2026; no licensed operators exist. A government-backed casino development proposal has been discussed (exclusive development right floated) but no legalisation has occurred. ⚠️ re-verify before publish — this is a live political question. | None found in research — Tonga does not appear in documented Survivor/major-production history. | ❌ GAP — no drone-specific regulation found this session; treat as unverified, flag for provider/legal confirmation. |
| Fiji | FJ | UTC+12 | Fijian Dollar (FJD) | English, Fijian, Fiji Hindi | Visa-free for most incl. AU/NZ/US/UK, typically 4 months 〜 | ✅ **Levuka Historical Port Town** (Ovalau) — Fiji's only WHS. | ✅ **Legal framework exists (Gaming Act 2009) but zero currently licensed casinos.** Government revoked the only prior licence in 2015 for non-compliance and has maintained a moratorium on new licences pending policy review (reaffirmed late 2023/early 2024). Land-based gambling generally (lottery, tote betting) is legal; online gambling may not be operated from within Fiji. | ✅ **Most-used Survivor country in franchise history** — Vanua Levu (Macuata) for earlier seasons (e.g. S14 Fiji), then the **Mamanuca Islands** for a long unbroken run — S44 (2022) was the 12th consecutive season filmed there. | **Regulated.** CAAF requires registration for all drones; recreational = online self-registration (form OP 137); commercial (paid photo/film) needs written CAAF authorisation (form OP 138). ✅ |
| Vanuatu | VU | UTC+11 | Vatu (VUV) | Bislama, English, French | Visa-free for most incl. AU/NZ/US, typically 30–90 days 〜 | ✅ **Chief Roi Mata's Domain** (Efate/Lelepa/Artok) — Vanuatu's only WHS. | ✅ **Legal.** Online gambling has a modern licensing framework (Vanuatu Interactive Gaming Act, 1993 base law updated mid-2024 — VGA Limited administers under the Dept. of Customs and Inland Revenue). **Land-based casino confirmed operating:** Grand Hotel & Casino, Port Vila (Zagame Corporation, Melbourne-owned) — reopened after restoration following the December 2024 earthquake; 140 slot machines, 16 tables. Le Meridien Port Vila Resort & Casino is a separate gaming property. | ✅ **US Survivor season 9 (2004)** filmed on Efate. | **Regulated** — CAAV requires RPAS/drone registration, proof of pilot competency, and public-liability insurance before flying. ✅ |
| Cook Islands | CK | UTC−10 | NZD (local Cook Islands dollar coins circulate) | Cook Islands Māori, English | Visa-free for most incl. AU/NZ/US, typically 31 days; Realm-country visa-free access to/from NZ 〜 | None confirmed | ❌ GAP — no evidence found of a legal casino regime; treat as prohibited/unregulated pending confirmation. | Not identified in research as a Survivor location. | **Recreational: no permit needed.** Commercial (paid photography/filming) requires a permit from the Ministry of Transport. ✅ |
| Niue | NU | UTC−11 | NZD | Niuean, English | Visa-free for most countries, 30 days; Realm-country status with NZ ✅ | None | ❌ GAP | Not identified. | ❌ GAP — no nation-specific rule found this session. |
| Palau | PW | UTC+9 | USD | Palauan, English | ✅ **US citizens visa-free up to 1 year under the Compact of Free Association**; most other nationals get a **30-day visa-on-arrival**, no pre-arranged visa, passport must have 6+ months validity. | ✅ **Rock Islands Southern Lagoon** — mixed natural/cultural WHS. | ✅ **Illegal** except social/non-profit gambling. Multiple legalisation attempts have failed (a presidential veto on an earlier bill is documented); a 2024 "Palau Tourism Enhancement Act" proposal (integrated resorts, tourists/non-citizens only) had not passed into law as of this session. Online gaming is blocked for Palauan citizens; limited digital-gaming licence activity exists at the regulatory-concession level. ⚠️ re-verify — active legislative question. | Not identified. | ❌ GAP — not found this session; Palau's famous **Palau Pledge** (mandatory passport-stamp environmental pledge at immigration) and the **$50 USD Green Fee / $30/day dive permit** around Rock Islands are the more load-bearing facts for the framework and are ✅ verified. |
| French Polynesia | PF | UTC−10 | CFP Franc (XPF, pegged to EUR) | French, Tahitian | ✅ **90 days visa-free for EU, US, Canada, Australia, UK and many others.** Not Schengen — separate regime from mainland France. 12-page US emergency passport NOT accepted for visa-free entry. | None confirmed in this territory specifically (France's own WHS list does not currently include a French Polynesian site) | 〜 GENERAL KNOWLEDGE — gambling is restricted under French-derived law; no legal casino industry identified. Not independently re-verified this session. | Not a Survivor location, but Bora Bora/Tahiti have a long history as a backdrop for other international productions (not independently catalogued this session). | ❌ GAP — not found this session; French civil aviation drone rules (via DGAC) likely apply but weren't confirmed for the territory specifically. |
| Solomon Islands | SB | UTC+11 | Solomon Islands Dollar (SBD) | English, Solomons Pijin | Visa-free/visa-on-arrival for most incl. AU/NZ, typically up to 90 days 〜 | None confirmed | ❌ GAP — no evidence of a legal casino regime found. | Not identified as a Survivor location. | ❌ GAP |
| Marshall Islands | MH | UTC+12 | USD | Marshallese, English | ✅ AU/NZ citizens visa-free (AU gets 30-day visa-on-arrival specifically); US nationals visa-free under Compact of Free Association. 6-month passport validity required. | ✅ **Bikini Atoll Nuclear Test Site** — the only WHS. | ❌ GAP | Not identified. | ❌ GAP |
| Federated States of Micronesia | FM | UTC+10/+11 (varies: Yap/Chuuk UTC+10, Pohnpei/Kosrae UTC+11) | USD | English + Yapese, Chuukese, Pohnpeian, Kosraean | ✅ No visa required for tourism; 6-month passport validity required. | None confirmed | ❌ GAP | Not identified. | ❌ GAP |
| Kiribati | KI | UTC+12 (Tarawa) / UTC+13 / **UTC+14 (Kiritimati/Line Islands — one of the first places on Earth each new day)** | Australian Dollar (AUD) | Gilbertese, English | ✅ AU/US visa-free short stay; NZ visa-free up to 90 days/12 months. 6-month passport validity required. | ✅ **Phoenix Islands Protected Area** — natural WHS, ~408,000 km² of ocean/atolls, one of the remotest marine protected areas on Earth. | ❌ GAP | Not identified. | ❌ GAP |
| Papua New Guinea | PG | UTC+10 | Kina (PGK) | English, Tok Pisin, Hiri Motu + 800+ local languages | Visa required for most nationalities (e-visa/visa-on-arrival schemes exist and change — not independently re-verified this session; flag before publishing specific advice) ⚠️ | 〜 **Kuk Early Agricultural Site** (Western Highlands) is PNG's WHS — not independently re-verified this session, flag before publishing. | ✅ **No casino open.** Gaming Control Act 2007 created the National Gaming Control Board (NGCB), which regulates gaming machines, sports betting, lotteries — but **no casino had opened as of October 2026** and there is no domestic online-casino licensing regime in operation. | None identified as a Survivor location, but PNG has a strong independent cultural-festival identity (Goroka Show, Hiri Moale — already seeded in `pacific_events`). | ❌ GAP |

**Section 1.1 cross-cutting flags:**
- **Decompression chambers, malaria, cyclone/volcanic risk, and crocodile risk are covered in §1.19/§1.20 (Natural Hazards) rather than repeated here**, to avoid duplication — those are the safety-critical fields and get their own verification treatment.
- Niue, Marshall Islands, FSM, Kiribati, and Solomon Islands have **no national gaming-law information publicly available in English-language sources** found this session. This is itself useful signal: these are small/low-tourism-volume jurisdictions where a `gaming_status: 'unknown_no_public_source'` value (not a guessed `'prohibited'`) is the honest schema value — see §2 Table 1's `gaming_status` enum, which includes exactly this state.

### 1.2 Air Connectivity

〜 **GENERAL KNOWLEDGE for all of this subsection — not independently re-verified against live airline schedules this session.** Airline route networks, codeshares, and seasonal fare ranges change multiple times a year; this table should be treated as a starting curation point, re-verified against each airline's own published timetable before any fare-range figure goes live.

| Nation | Main int'l gateway | Primary carriers (indicative) | Key hub connections | Notes |
|---|---|---|---|---|
| Samoa | Faleolo (APW) | Fiji Airways, Samoa Airways, Talofa Airways (American Samoa shuttle) | Auckland, Nadi, Sydney (seasonal), Pago Pago | |
| Tonga | Fua'amotu (TBU) | Fiji Airways, Air New Zealand, Real Tonga (domestic) | Nadi, Auckland | |
| Fiji | Nadi (NAN) | Fiji Airways (own hub), Air New Zealand, Qantas, Virgin Australia, Korean Air (seasonal), China Airlines | Auckland, Sydney, Melbourne, Brisbane, LAX, Honolulu | Fiji is the only nation in scope with a genuinely long-haul-connected hub carrier of its own. |
| Vanuatu | Port Vila (VLI) | Fiji Airways, Air Vanuatu, Air New Zealand (seasonal), Air Calin (regional) | Nadi, Brisbane, Auckland, Noumea | ⚠️ **Air Vanuatu suspended operations in May 2024 amid insolvency and has since resumed under a restructured arrangement** — route network at time of publish must be re-verified, not assumed to match pre-2024 schedules. |
| Cook Islands | Rarotonga (RAR) | Air New Zealand, Jetstar, Air Tahiti | Auckland, LAX (periodic direct), Papeete | |
| Niue | Hanan Int'l (IUE) | Air New Zealand only (weekly-ish) | Auckland | Single-carrier, low-frequency — a structural accessibility constraint for the whole destination, worth its own field. |
| Palau | Roman Tmetuchl Int'l / Koror (ROR) | United Airlines "Island Hopper", Korean Air, China Airlines (seasonal) | Guam, Seoul, Taipei, Manila | |
| French Polynesia | Faa'a / Tahiti (PPT) | Air Tahiti Nui (own hub), Air France, French Bee, Air New Zealand, United | LAX, Paris CDG, Auckland, Tokyo | Air Tahiti (domestic, separate carrier) connects outer islands including Bora Bora. |
| Solomon Islands | Honiara (HIR) | Solomon Airlines (own hub), Fiji Airways | Brisbane, Nadi, Port Vila | |
| Marshall Islands | Majuro (MAJ) | United "Island Hopper", Nauru Airlines (limited) | Honolulu, Guam, Kwajalein | |
| FSM | Varies by state — Yap, Chuuk, Pohnpei, Kosrae each have an airport | United "Island Hopper" (single route serving all four states) | Guam, Honolulu | The Island Hopper is a single structural dependency for the entire nation's air access — worth flagging as a resilience risk in destination-profile copy. |
| Kiribati | Bonriki/Tarawa (TRW); Kiritimati separately (CXI) | Fiji Airways, Nauru Airlines | Nadi, Brisbane (via Nauru) | Kiritimati (Christmas Island)'s own international air access is sparse and should be independently verified before being described as "connected" — do not assume Tarawa's air links apply to Kiritimati. |
| PNG | Port Moresby (POM) | Air Niugini (own hub), PNG Air, Qantas (codeshare) | Brisbane, Cairns, Singapore, Manila, Nadi, Honiara | |

**Fare ranges and airport-transfer costs:** not populated with specific USD figures in this report — airline seasonal pricing (Christmas/Easter/off-peak) is too volatile to curate as a static field and should be either (a) a provider/agent-queried live quote via an airline API/aggregator (out of scope for this framework) or (b) a loosely-bucketed `fare_range_indicator: 'budget'|'mid'|'premium'` self-maintained field, re-verified quarterly, rather than a specific dollar figure that will visibly rot.

### 1.3 Accommodation Overview

International chain presence 〜 **GENERAL KNOWLEDGE, high confidence for Fiji and French Polynesia, lower confidence elsewhere — verify brand names/property status before publishing:**

| Nation | Chain presence | Notes |
|---|---|---|
| Fiji | Sheraton, Westin, Hilton, InterContinental, Outrigger, Shangri-La, Marriott, Radisson, DoubleTree | Fiji is the deepest international-chain market in the region by a wide margin. |
| French Polynesia | Four Seasons, St Regis, InterContinental, Conrad, Sofitel | Overwater-bungalow tier is strongest/most internationally branded here of any nation in scope. |
| PNG | Hilton, Holiday Inn, Crowne Plaza (Port Moresby) | Chain presence concentrated in Port Moresby for business travel, not resort tourism. |
| Palau | Historically Marriott-affiliated (Palau Pacific Resort lineage), Sheraton | Lower confidence — verify current brand affiliations. |
| Samoa | Sheraton (Aggie Grey's Hotel & Bungalows) | Otherwise predominantly independent/locally-branded. |
| Cook Islands | **No major global chain** | 〜 Widely reported as a deliberate local-ownership/building-height policy norm rather than a market gap — worth confirming with Cook Islands Tourism directly rather than assuming it's simply unaddressed demand. |
| Tonga, Vanuatu, Solomon Islands, Marshall Islands, FSM, Kiribati, Niue | **No major global chain identified** | Predominantly independent/locally-owned properties. This is a genuine market characteristic, not a data gap — it should be captured as `locally_owned: true` at high rates in `tourism_accommodations`, not treated as missing data. |

**Official star-rating systems:** ❌ GAP across almost all 13 nations — no evidence found this session of a nationally-administered hotel star-rating certification body for any Pacific nation in scope (unlike, say, Australia's AAA rating). Fiji Hotel and Tourism Association (FHTA, confirmed to exist and active — it publishes the dive-emergency protocol cited in §1.20) may perform some self-certification role but this wasn't confirmed as a formal star-rating authority. **Recommend:** `tourism_accommodations.star_rating_official` stays nullable with a `star_rating_self_declared` field as the realistic primary signal (already specified in the Part 2 brief) — do not imply a national certifying body exists where none was found.

### 1.4 Inter-Island Transport

This is one of the two largest structural data gaps in the whole framework (the other is accessibility, §1.17/§5).

| Nation | Ferry situation | Domestic air |
|---|---|---|
| Fiji | Multiple operators (e.g. Goundar Shipping, Patterson Brothers-type interisland services run between Viti Levu/Vanua Levu/outer islands) 〜 not independently re-verified this session | Fiji Airways domestic network, Northern Air | Most developed inter-island network in scope. |
| Vanuatu | Inter-island ferries exist (e.g. a "Big Sista"-class vessel class is commonly referenced) 〜 not independently verified this session | Air Vanuatu domestic routes — subject to the same 2024 insolvency/restructuring caveat as §1.2 | |
| Cook Islands | Minimal scheduled inter-island ferry; most outer-island access is by air | Air Rarotonga (domestic) | |
| Tonga | Inter-island ferries connect Tongatapu/Vava'u/Ha'apai 〜 not independently verified | Real Tonga (domestic) | |
| PNG | Coastal shipping exists but is largely informal/cargo-passenger mixed, not a tourist-oriented scheduled service | PNG Air, Hevilift (charter-oriented) | PNG's domestic transport is the hardest in scope to model as a clean "route + schedule + price" table — much of it is genuinely ad hoc. |
| Solomon Islands | ❌ **No tourist-oriented ferry operator website identified this session.** Inter-island transport is largely informal/cargo boats. | Solomon Airlines domestic | |
| Marshall Islands | ❌ No operator website identified | Air Marshall Islands (status should be re-verified — small Pacific domestic carriers have a history of operational interruptions) | |
| FSM | ❌ No operator website identified for inter-state sea transport | United Island Hopper is effectively the only practical inter-state connection for most visitors | |
| Kiribati | ❌ No operator website identified; inter-island transport within the Gilbert group and especially to the Line/Phoenix groups is a known hard logistics problem | Air Kiribati (domestic, limited) | |
| Samoa, Niue, Palau, French Polynesia | Samoa: ferry between Upolu/Savai'i is an established, frequently-used scheduled service 〜; Niue: single island, N/A; Palau: boat charter-based, not scheduled ferry; French Polynesia: Air Tahiti domestic network plus established inter-island ferry/catamaran services (Moorea in particular) are well documented | | |

**Recommendation:** For Solomon Islands, Marshall Islands, FSM, and Kiribati specifically, `tourism_transport` rows for inter-island routes should be sourced **from provider self-listing only** (a charter-boat or air operator registering their own route) — do not attempt to curate a "nationally comprehensive" ferry schedule for these four nations; the public source does not exist to do it responsibly.

### 1.5 Activities and Experiences

**Scuba diving — named sites (high-confidence, well-documented in dive literature; depth/visibility/certification specifics should be confirmed per-operator at self-listing time rather than asserted as a fixed curated fact, since conditions vary seasonally):**

| Nation | Named sites | Notable wreck/technical dives |
|---|---|---|
| Fiji | Rainbow Reef (Somosomo Strait, soft-coral diving), Beqa Lagoon (bull shark dive — Beqa Adventure Divers' shark feed is an internationally known, well-regulated dive), Namena Marine Reserve, Great Astrolabe Reef (Kadavu) | |
| Palau | Blue Corner, German Channel, Jellyfish Lake (**snorkel-only, no scuba/fins — the jellyfish are stingless and the lake is a protected non-dive site**, an important distinction for activity-type tagging), Peleliu WWII sites | WWII wrecks around Peleliu |
| Vanuatu | — | **SS President Coolidge** (Espiritu Santo) — one of the world's largest accessible wreck dives; Million Dollar Point |
| PNG | Milne Bay, Kimbe Bay (Walindi Plantation Resort area), Madang | Rabaul-area WWII wrecks |
| Solomon Islands | Marovo Lagoon, Tulagi | **Iron Bottom Sound** (Guadalcanal) — major WWII wreck site |
| FSM | Yap (manta ray cleaning stations — a signature draw), Pohnpei | **Chuuk Lagoon (Truk Lagoon)** — globally ranked among the best wreck-diving sites on Earth, Japanese Combined Fleet sunk in Operation Hailstone (Feb 1944) |
| Marshall Islands | Kwajalein | **Bikini Atoll** — technical/advanced wreck diving (USS Saratoga and others), a UNESCO-listed site (§1.1) — extremely niche, high-cost, advanced-certification-only market segment |
| Samoa | Palolo Deep Marine Reserve (Apia — shore-accessible snorkel/dive) | — |
| Tonga | Vava'u (caves — Swallows Cave, Mariner's Cave) | — |
| Cook Islands, Niue | Aitutaki Lagoon (Cook Islands, primarily snorkel); Niue's **Chasm, Avaiki Cave** and exceptional (60m+) visibility are a signature differentiator; Niue also has resident banded sea snakes ("katuali") as a notable marine-life highlight | — |

**Surfing — named breaks:**
- Fiji: **Cloudbreak** (near Tavarua/Namotu — world-class reef break, advanced/expert), Frigate's Passage. High international surf-tourism profile.
- Samoa: Salani, Boulders area — intermediate/advanced reef breaks.
- PNG: **Vanimo** is notable specifically for the **PNG Surfing Association's community-benefit model**, where surf tourism revenue is structured to flow to the customary landowning communities at the break — a genuinely differentiated sustainability/local-ownership story worth its own field value.
- Vanuatu, Tonga: surf tourism exists but is far less developed/documented than Fiji; treat as provider-self-listed rather than curated.

**Whale watching:**
- **Tonga (Vava'u)** is the signature regional destination — humpback whale season roughly July–October, and Tonga is one of the only places in the world where **regulated in-water swimming with humpback whales** is permitted (not just boat-based viewing) — this is a major differentiating fact worth its own schema field (`in_water_swimming_permitted`).
- Niue and Samoa sit on a similar humpback migration corridor with viewing opportunities in a similar seasonal window.
- Cook Islands also has a recognised humpback season.

**Cultural activities — high-value, well-documented:**
- Samoa/Tonga: both have genuinely strict **Sunday observance** — this is covered in depth in §1.21 (Cultural Protocols) since it is legally and socially load-bearing, not just a "nice to know."
- Fiji: **kava (yaqona) ceremony** is widely offered to tourists in a structured, respectful format; traditional thatched **village of Navala** is a well-known cultural-tourism destination; **lovo** (earth-oven feast) is a common tourist cultural-dining experience.
- Vanuatu: **Pentecost Island land diving (Naghol)** — April to June only, strictly seasonal, the historical precursor to bungee jumping — a globally unique, highly seasonal signature activity.
- PNG: **Goroka Show and Mount Hagen Show** (sing-sing festivals — already partially represented in the existing `pacific_events` seed data per §0.1) are PNG's premier cultural-tourism events, alongside PNG's extraordinary linguistic/cultural diversity (800+ languages) as a standing differentiator.

**Day trips / out-to-island:** Well documented for Fiji (Mamanuca/Yasawa day-trip cruises), Cook Islands (Aitutaki lagoon cruises), French Polynesia (Bora Bora lagoon tours) — essentially undocumented at a curated level for Solomon Islands, Marshall Islands, FSM, Kiribati, where this category should be provider-self-listed only.

### 1.6–1.10 Food & Beverage, Markets, Conference Venues, Events, Natural Features

These five categories share the same sourcing reality: **strong curated coverage for destination-level generalities (traditional dishes, alcohol law, named flagship markets), near-total reliance on provider self-listing for venue-level specifics (individual restaurants, individual conference rooms, individual market stalls).**

- **Alcohol licensing:** Samoa's Sunday restriction is ✅ verified in detail (§1.21). Other nations' alcohol law was not independently re-verified this session — flag each before publishing specific claims (e.g., do not assert Tonga, Kiribati, or FSM alcohol rules without a dedicated check; these vary and some outer-island/atoll communities have their own local prohibition norms that a national-level law won't capture).
- **Traditional dishes** (high-confidence 〜 general knowledge, safe to seed as destination-profile text, not safety/legal-critical): Samoa — *palusami*, *oka*, umu-cooked pork; Fiji — *kokoda* (coconut-marinated raw fish), *lovo*; Tonga — *lu pulu*; PNG — *mumu*; Solomon Islands/Vanuatu — root-crop and coconut-based dishes broadly similar to the regional pattern; French Polynesia — *poisson cru*.
- **Named markets** (high-confidence 〜 general knowledge for the flagship market in each capital — exact hours/payment-method/signature-product detail should be provider/field-verified, not assumed stable): Suva Municipal Market (Fiji), Apia's Fugalei Market (Samoa), Port Vila Market (Vanuatu), Honiara Central Market (Solomon Islands).
- **Conference venues:** no nationally-curated directory exists for any of the 13 nations found this session — this entire category is **provider-self-listed only** (§4.6), seeded at most with a handful of well-known flagship properties (e.g. Grand Pacific Hotel, Suva) added manually at launch.
- **Events calendar:** the existing `pacific_events` table (§0.1) is the correct starting seed and already covers WS/FJ/TO/PG/SB/VU/CK — Palau, French Polynesia, Marshall Islands, FSM, Kiribati, Niue have **zero events currently seeded** and are a direct extension task, not a from-scratch research task.
- **Natural features / beaches / reefs:** the coral-health join (§0.3, §3.12) means `tourism_activities`/natural-feature rows should **store coordinates and query NOAA live**, never a static "reef health" text snapshot that will silently go stale.

### 1.11 Natural Hazards and Safety — Marine and Land

| Hazard | Findings |
|---|---|
| **Malaria** | ✅ VERIFIED. **High year-round risk, P. falciparum-dominant, chloroquine-resistant: PNG.** **High year-round risk: Solomon Islands** (prophylaxis recommended for travelers). **Low-to-moderate, P. vivax-dominant, year-round: Vanuatu.** All other 10 nations in scope (Samoa, Tonga, Fiji, Cook Islands, Niue, Palau, French Polynesia, Marshall Islands, FSM, Kiribati) are understood to be malaria-free/negligible-risk per standard WHO Western Pacific classification — not independently re-verified nation-by-nation this session, but consistent with well-established travel-medicine guidance. |
| **Crocodiles** | ✅ VERIFIED — genuine, non-theoretical risk in two nations. **PNG:** saltwater crocodiles present in rivers and coastal estuaries nationally; the **Sepik River** specifically is called out as a hotspot; population has grown since a 1980 export ban. **Solomon Islands:** saltwater crocodiles live in mangrove areas; **documented fatal attacks exist** (two men killed in 2021 while diving for sea cucumber/beche-de-mer at night) and local sources note there are often no warning signs posted. Standard advice found: avoid swimming in rivers, estuaries, mangrove-adjacent waters in both nations; seek local guide advice before any freshwater or estuary activity. |
| **Volcanic activity** | ✅ VERIFIED, ⚠️ **highly volatile — this is a live-monitoring fact, not a static one.** Vanuatu: **Ambae (Manaro Voui)** was at **Alert Level 3** as of this session (activity intensified Jan–Feb 2026, raised from Level 2 on 23 Feb 2026, ash plumes to ~14,000–15,000 ft through the year), with a hazard zone / Danger Zone B of ~3 km radius around the active vent confined to Lake Voui. **Yasur (Tanna)** was at **Alert Level 2** ("major unrest") with ongoing Strombolian/Vulcanian activity and a permanent ~600 m exclusion zone around the active vents — summit access restricted and described as highly hazardous. **Recommendation:** this field must be designed as a live-refreshed value (link to Vanuatu Geohazards — vmgd.gov.vu/warnings/volcano — as the authoritative live source), never a static seed, given how fast these levels move. |
| **Cyclone season** | ✅ VERIFIED. The official South Pacific cyclone season runs **1 November – 30 April**, though systems can technically form outside that window; peak activity is **mid-February to early March**. This is a single pan-regional fact applicable to every nation in scope south of the equator (note: Marshall Islands, FSM, and Kiribati sit in the North Pacific/equatorial basin with a different typhoon-season framework — do not apply the South Pacific Nov–Apr window to those three without separately checking the North Pacific typhoon season convention). |
| **Box jellyfish / stingers** | ❌ GAP — no nation-specific, citable public hazard-mapping source was found this session for Pacific SIDS specifically (unlike, e.g., Australia's well-documented stinger-season signage). Do not assert a specific risk level per nation without further research; treat as unverified and flag conspicuously if a dive/snorkel operator wants to make a safety claim about it at self-listing time. |
| **Decompression chambers** | ✅ VERIFIED — the single most safety-critical fact set in this entire report. See §1.20. |

### 1.12 Health Infrastructure and Emergency Services

✅ **VERIFIED — Decompression/hyperbaric chamber status (critical for dive-planning agents, Decision Register item implied by the brief's "CRITICAL for dive agents" flag):**

| Nation | Chamber status | Detail |
|---|---|---|
| Fiji | **Two facilities.** Colonial War Memorial Hospital (CWMH), Suva — the long-standing public chamber; alert via CWM switchboard (331 3444), which pages the on-duty Hyperbaric Doctor. **New second facility opened in Nadi** (PSH Hospitals, launched 31 December 2024) — closer to the main dive-tourism area (Mamanuca/Yasawa access point) than Suva. |
| Papua New Guinea | **One facility, Port Moresby** — the chamber was acquired from DAN/Hyperbaric Partners Limited by the **PNG Divers Association (PNGDA)**, effective 1 January 2025, specifically to keep in-country treatment available and avoid overseas medevac for decompression sickness. |
| Vanuatu | **Santo (Espiritu Santo)** has a fully staffed hyperbaric recompression chamber — notable because Santo is also the SS President Coolidge wreck-dive location (§1.5), so the chamber is co-located with the highest-risk technical dive site in the nation. |
| Solomon Islands | ⚠️ **Chamber exists in Honiara but is reported NOT currently operational** — it is run by on-call volunteers and was found to be non-functional at time of research. Divers Alert Network (DAN) explicitly advises that medical evacuation to Australia or New Zealand should be anticipated for decompression complications, and strongly recommends dive insurance. **This is the single most important safety flag to surface prominently to any dive-planning agent querying Solomon Islands data** — a naive "chamber: yes" boolean would be actively dangerous; the schema must capture operational status, not just existence (see Table 8, §2). |
| Samoa, Tonga, Cook Islands, Niue, Palau, French Polynesia, Marshall Islands, FSM, Kiribati | ❌ No dedicated in-country decompression/hyperbaric facility identified in research for any of these nine. **Default assumption for the schema should be "no chamber — medevac required," not silence/null**, given how safety-critical this field is. DAN's regional support list (cited for Vanuatu/PNG/Solomons/Truk/Thailand) does not include these nine, which is itself informative. |

**Medical evacuation:** regional pattern is evacuation to Australia, New Zealand, or (for FSM/Marshall Islands/Palau) Guam/Honolulu/Manila depending on geography; cost and insurance-coverage specifics were not independently priced this session — flag as provider/insurer-sourced rather than curated.

### 1.13–1.18 Proximity Intelligence, Connectivity, Accessibility, Sustainability

- **Proximity/location intelligence:** no public pan-Pacific source computes this; it is inherently a **per-property fact**, correctly scoped by the brief as something captured at provider-listing time (self-declared) for providers, and derived from OSM/geocoding for curated baseline rows where coordinates are known. Given the OSM Nominatim rate-limit finding (§1.0), production proximity computation should use a self-hosted Nominatim instance or a commercial geocoder, not the public endpoint.
- **Connectivity:** 〜 general knowledge — **Digicel is the dominant mobile carrier across most of the region** (Fiji, PNG, Vanuatu, Samoa, Tonga, Solomon Islands all have Digicel as a major or sole carrier historically); Vodafone is Fiji's other major carrier; Bluesky operates in Samoa; smaller state-linked telcos operate in Cook Islands, Tonga, and elsewhere. Not independently re-verified nation-by-nation this session — treat as a starting point, verify current carrier/coverage maps before publishing specific 4G/5G claims.
- **Accessibility tourism:** ❌ **GAP across every one of the 13 nations.** No public accessibility-tourism directory, government accessibility-infrastructure assessment, or adaptive-dive-operator registry was identified for any Pacific SIDS in scope. This matches the brief's own framing ("underserved in the Pacific — document honestly"). **This entire table (Table 13, §2) will launch empty or near-empty from curated sources and depend entirely on provider self-declaration plus, ideally, direct outreach to regional disability-advocacy organisations** — a genuine Phase 2 research project in its own right, not something this report can responsibly fill with placeholder claims.
- **Sustainability/certification:** ✅ SPTO's **Pacific Sustainable Tourism Indicators Framework (PSTIF)**, launched 2022, is a confirmed real regional initiative — it's the natural reference point for a `sustainability_certification` field's controlled vocabulary, though it's a measurement framework, not an operator-level eco-certification body. No Pacific-specific eco-certification scheme (equivalent to, say, Green Globe or EarthCheck operating regionally) was independently confirmed this session — where providers hold **Green Globe** or **EarthCheck** certification (both operate in the Pacific under general knowledge, not re-verified) that should be captured as the certifying-body name, not assumed to be a Pacific-specific scheme.

### 1.19 Safety Advisories — Architectural Recommendation

Travel advisory *levels* (DFAT, UK FCDO, US State Dept, NZ SafeTravel) are **the single most time-sensitive fact category in the entire report** and none of the four source agencies was found to publish a clean public API this session (all are HTML-rendered pages). **Do not seed `tourism_destinations.current_advisory_level` as a static curated value.** Two compliant options:
1. A scheduled scraper (daily cron) re-reading each agency's page per nation and diffing for level changes — technically feasible but fragile against page-structure changes and arguably in tension with each site's own terms of use (not independently reviewed this session — check ToS before building a scraper against government advisory pages specifically).
2. **Recommended:** `GET /tourism/destination/{nation_code}/advisories` (§3) resolves to a `source_type: 'curated'` row with an explicit `last_verified` date and a direct outbound link to the authoritative source, refreshed manually on a short (weekly) cadence by the Registry Operations Team (Decision 62) rather than claimed to be real-time. This is honest about staleness rather than pretending to be live when it structurally can't be.

### 1.20 Weddings and Honeymoon

✅ **VERIFIED for Fiji and Cook Islands, the region's two established wedding-tourism destinations:**

| Nation | Residency/waiting period | Key documents | Legally binding? |
|---|---|---|---|
| Fiji | **No residency requirement.** Must be in Fiji at least 1 day before the ceremony; apply for a special Marriage Licence in person at the registry/district office on the island of the wedding **at least 3 working days** before the ceremony (licence valid 28 days from issue, processed within ~1 working day once lodged). | Both passports, divorce papers if applicable, death certificate if widowed, 2 witnesses with valid photo ID, Certificate of Single Status / Certificate of No Impediment. | Yes, fully legally binding and internationally recognised. |
| Cook Islands | Apply **in person, at least 3 working days** before the ceremony, to the Registrar of Marriages — **cannot apply from outside the Cook Islands.** Minimum age 16 with parental/guardian consent required under 21; age of consent otherwise 21. | Passport, birth certificate, Notice of Intended Marriage form; Decree Absolute if divorced; death certificate if widowed; Catholic couples need a pre-marriage course certificate + baptism certificates. | Yes, legally binding and internationally recognised. **Same-sex marriage is explicitly not permitted.** |
| All other 11 nations | 〜 GENERAL KNOWLEDGE / ❌ not independently verified this session | — | — |

**Recommendation:** Do not publish wedding-requirement copy for the other 11 nations (Samoa, Tonga, Vanuatu, Niue, Palau, French Polynesia, Solomon Islands, Marshall Islands, FSM, Kiribati, PNG) until each is independently verified with the same rigor as Fiji/Cook Islands — getting marriage-law details wrong is a direct harm vector for a real couple's travel plans, not a cosmetic content gap.

---

## PART 2 — SUPABASE SCHEMA DESIGN

**Design decisions made explicit before the DDL** (per CLAUDE.md P5/P9 — flag before building):

1. **No new `trust_tiers` table is created.** The brief's reference to "trust tier (from PDC trust tier system)" resolves to `providers.trust_tier` (existing `bronze`/`silver`/`gold` enum column, confirmed in `session1_migration.sql`). `tourism_providers` holds a 1:1 FK to the existing `providers.id`, not a duplicate trust-tier field.
2. **`tourism_providers` extends `providers`, it does not duplicate it.** Contact details, wallet address, onboarding status, and fee-collection fields already exist on `providers`. `tourism_providers` adds only tourism-category-specific fields (business category, certifications, languages spoken, years operating, eco-cert) and the category link to its content table row.
3. **Every content table (`tourism_accommodations`, `tourism_activities`, etc.) carries both `provider_id` (nullable FK → `providers.id`) and `endpoint_id` (nullable FK → `endpoints.id`).** A `source_type = 'curated'` row has `provider_id IS NULL` (SBP is the publisher under Decision 59's first-party posture) and may or may not yet have an `endpoint_id` if it's pre-registration. A `source_type = 'provider_self_listed'` row has both populated once verified.
4. **`pacific_events` → `tourism_events`:** this migration should extend the existing table in place (add the broader category list, backfill `source_type = 'curated'`) rather than create a second, parallel events table. The DDL below is written as an `ALTER TABLE pacific_events RENAME TO tourism_events` + column-additions migration, not a fresh `CREATE TABLE`.
5. **Geographic join key for hazard/dive/reef data is `lat`/`lon` (NUMERIC), matching the existing coral-bleaching endpoint's query shape (§0.3) — not solely `nation_code`.** Every table with a physical location carries `lat`/`lon` columns for this reason, even where `nation_code` is also present for filtering.
6. **NFT stub fields are present and inert.** Every stub field defaults to `false`/`NULL` and carries a `-- STUB, NOT YET IMPLEMENTED` comment. No trigger, function, or application logic reads them yet.

### Table 1 — `tourism_destinations`

```sql
CREATE TABLE IF NOT EXISTS tourism_destinations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code               TEXT NOT NULL UNIQUE,  -- ISO 3166-1 alpha-2: WS, TO, FJ, VU, CK, NU, PW, PF, SB, MH, FM, KI, PG
  nation_name               TEXT NOT NULL,
  island_groups             TEXT[],                 -- e.g. ARRAY['Upolu', 'Savai''i'] for Samoa
  capital_city              TEXT NOT NULL,

  -- Baseline profile
  timezone                  TEXT NOT NULL,           -- IANA tz, e.g. 'Pacific/Apia'
  currency_code             TEXT NOT NULL,            -- ISO 4217: WST, TOP, FJD, VUV, NZD, USD, XPF, SBD, PGK, AUD
  official_languages        TEXT[] NOT NULL,
  spoken_languages          TEXT[],

  -- Entry requirements (JSONB keyed by passport nationality group — schema stays
  -- stable as new nationalities are added without a migration)
  -- Structure: {"AU": {"visa_required": false, "max_stay_days": 90, "notes": "..."}, "US": {...}, ...}
  visa_requirements         JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Seasonality
  dry_season_months         INTEGER[],   -- 1-12
  wet_season_months         INTEGER[],
  cyclone_season_start_month INTEGER CHECK (cyclone_season_start_month BETWEEN 1 AND 12),
  cyclone_season_end_month   INTEGER CHECK (cyclone_season_end_month BETWEEN 1 AND 12),
  -- NULL for nations outside the South Pacific cyclone basin (MH, FM, KI sit in a
  -- different basin/typhoon-season convention — see §1.11, do not default to Nov-Apr)

  -- Heritage and landmarks
  unesco_sites              JSONB DEFAULT '[]'::JSONB,  -- [{name, type: 'natural'|'cultural'|'mixed', location}]
  protected_sites           JSONB DEFAULT '[]'::JSONB,

  -- Gaming (Decision-relevant: SBP makes no quality/legality judgment, this is
  -- a factual regulatory-status field only)
  gaming_status             TEXT NOT NULL DEFAULT 'unknown_no_public_source' CHECK (gaming_status IN (
                              'legal_operating', 'legal_framework_no_licensees',
                              'illegal', 'proposed_not_yet_legal',
                              'unknown_no_public_source'
                            )),
  gaming_regulatory_body    TEXT,
  licensed_casino_count     INTEGER DEFAULT 0,
  notable_casino_properties JSONB DEFAULT '[]'::JSONB,  -- [{name, operator, location}]
  gaming_status_notes       TEXT,
  gaming_status_last_verified DATE,
  -- Volatile field (§1.1/§1.11) — must carry its own last_verified, distinct
  -- from the row-level last_verified, because gaming law changes faster than
  -- the rest of a destination profile

  -- Film/TV history
  film_production_history   JSONB DEFAULT '[]'::JSONB,  -- [{production, season_or_title, year, location, tourist_accessible: bool}]

  -- Drone regulation
  drone_permit_required     BOOLEAN,
  drone_permit_commercial_only BOOLEAN,  -- true = recreational needs no permit, commercial does
  drone_regulatory_body     TEXT,
  drone_restricted_zones    TEXT,
  drone_rules_notes         TEXT,
  drone_rules_last_verified DATE,

  -- Travel advisory (see §1.19 — intentionally NOT a live-claimed field)
  advisory_dfat_level       TEXT,
  advisory_us_state_level   TEXT,
  advisory_uk_fcdo_level    TEXT,
  advisory_nz_safetravel_level TEXT,
  advisory_last_verified    DATE,
  advisory_source_urls      JSONB DEFAULT '{}'::JSONB,

  -- Emergency contacts
  emergency_police          TEXT,
  emergency_ambulance       TEXT,
  emergency_coast_guard     TEXT,
  tourist_police_available  BOOLEAN DEFAULT FALSE,

  -- Provenance (Decision 61/62 — data_currency and attribution mandatory)
  source_type               TEXT NOT NULL DEFAULT 'curated' CHECK (source_type IN ('curated', 'provider_self_listed', 'hybrid')),
  data_source                TEXT,   -- e.g. 'SPTO / Samoa Tourism Authority / WHO / DFAT Smartraveller'
  attribution_text          TEXT,
  last_verified              DATE,

  -- Endpoint linkage
  endpoint_id                UUID REFERENCES endpoints(id) ON DELETE SET NULL,

  created_at                 TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                 TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tourism_destinations_nation ON tourism_destinations(nation_code);
CREATE INDEX idx_tourism_destinations_gaming_gin ON tourism_destinations USING GIN (notable_casino_properties);
CREATE INDEX idx_tourism_destinations_visa_gin ON tourism_destinations USING GIN (visa_requirements);

ALTER TABLE tourism_destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_destinations_public_read" ON tourism_destinations
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_destinations_service_write" ON tourism_destinations
  FOR ALL TO service_role USING (true);
CREATE TRIGGER tourism_destinations_updated_at
  BEFORE UPDATE ON tourism_destinations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Table 2 — `tourism_accommodations`

```sql
CREATE TABLE IF NOT EXISTS tourism_accommodations (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code                TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  provider_id                 UUID REFERENCES providers(id) ON DELETE CASCADE,  -- NULL if source_type='curated'
  endpoint_id                  UUID REFERENCES endpoints(id) ON DELETE SET NULL,

  -- Identity
  property_name                TEXT NOT NULL,
  property_type                 TEXT NOT NULL CHECK (property_type IN (
                                  'backpacker', 'guesthouse_bnb', 'mid_range_hotel',
                                  'boutique_resort', 'luxury_resort', 'overwater_bungalow',
                                  'traditional_fale_bure', 'villa', 'homestay'
                                )),
  star_rating_official           NUMERIC(2,1),  -- NULL — no national certifying body found, see §1.3
  star_rating_self_declared       NUMERIC(2,1),
  international_chain             TEXT,  -- e.g. 'Sheraton', 'Hilton' — NULL if independently owned
  locally_owned                   BOOLEAN,
  years_operating                 INTEGER,

  -- Location
  island                          TEXT,
  town_or_district                 TEXT,
  lat                               NUMERIC(9,6),
  lon                               NUMERIC(9,6),

  -- Rooms
  room_count_total                  INTEGER,
  room_breakdown                     JSONB DEFAULT '{}'::JSONB,  -- {"standard": 20, "deluxe": 10, "suite": 4, "overwater": 6, "fale_bure": 0, "villa": 0}

  -- Pool / spa / fitness
  pool_count                         INTEGER DEFAULT 0,
  pool_type                           TEXT CHECK (pool_type IN ('freshwater', 'saltwater', 'both', NULL)),
  pool_adults_only_option              BOOLEAN DEFAULT FALSE,
  pool_swim_up_bar                     BOOLEAN DEFAULT FALSE,
  spa_available                        BOOLEAN DEFAULT FALSE,
  spa_services                         TEXT[],
  spa_local_treatments                 BOOLEAN DEFAULT FALSE,
  gym_available                        BOOLEAN DEFAULT FALSE,
  kids_club_available                  BOOLEAN DEFAULT FALSE,
  kids_club_age_range                  TEXT,

  -- Accessibility
  accessible_room_count                 INTEGER DEFAULT 0,
  accessibility_features                 TEXT[],

  -- Restaurant on-site
  restaurant_onsite                       BOOLEAN DEFAULT FALSE,
  restaurant_cuisine_type                  TEXT[],
  restaurant_open_to_nonguests              BOOLEAN DEFAULT FALSE,
  restaurant_dining_tier                    TEXT CHECK (restaurant_dining_tier IN ('casual', 'mid_range', 'fine_dining', 'buffet', NULL)),
  restaurant_traditional_dishes              TEXT[],
  restaurant_signature_cocktails              TEXT[],
  restaurant_kava_bar                         BOOLEAN DEFAULT FALSE,
  restaurant_dietary_options                  TEXT[],  -- vegetarian, vegan, halal, gluten_free, dairy_free
  restaurant_rating_source                     TEXT,
  restaurant_rating_score                       NUMERIC(3,1),
  restaurant_byo_permitted                      BOOLEAN DEFAULT FALSE,
  alcohol_licence_status                        TEXT,

  -- Bar
  bar_onsite                                      BOOLEAN DEFAULT FALSE,
  bar_beachfront                                   BOOLEAN DEFAULT FALSE,
  bar_swim_up                                       BOOLEAN DEFAULT FALSE,
  bar_happy_hour_times                              TEXT,

  -- Casino on-site (factual only — SBP makes no legality/quality judgment, Decision 10 posture)
  casino_onsite                                      BOOLEAN DEFAULT FALSE,
  casino_type                                         TEXT,
  casino_gaming_hours                                  TEXT,
  casino_dress_code                                    TEXT,
  casino_minimum_age                                    INTEGER,

  -- Conference facilities
  conference_facilities                                 BOOLEAN DEFAULT FALSE,
  conference_max_capacity_theatre                        INTEGER,
  conference_breakout_rooms                               INTEGER,
  conference_av_standard                                   TEXT,
  conference_catering_inhouse                              BOOLEAN DEFAULT FALSE,
  conference_outdoor_capacity                               INTEGER,

  -- Wedding venue
  wedding_venue                                              BOOLEAN DEFAULT FALSE,
  wedding_ceremony_types                                      TEXT[],  -- 'symbolic', 'legally_binding'
  wedding_beach_permit_held                                    BOOLEAN DEFAULT FALSE,
  wedding_traditional_elements                                  TEXT[],
  honeymoon_packages_available                                   BOOLEAN DEFAULT FALSE,

  -- Transfers / services
  airport_transfer                                                 TEXT CHECK (airport_transfer IN ('included', 'fee', 'not_available')),
  airport_transfer_fee_usd                                           NUMERIC(10,2),
  water_sports_equipment_hire_onsite                                 BOOLEAN DEFAULT FALSE,
  currency_exchange_onsite                                             BOOLEAN DEFAULT FALSE,
  laundry_service                                                      BOOLEAN DEFAULT FALSE,

  -- Proximity (km; see §1.13 — OSM-derived for curated rows, self-declared for provider rows)
  distance_to_town_km                                                   NUMERIC(6,2),
  distance_to_airport_km                                                 NUMERIC(6,2),
  distance_to_hospital_km                                                 NUMERIC(6,2),
  distance_to_pharmacy_km                                                  NUMERIC(6,2),
  distance_to_atm_km                                                       NUMERIC(6,2),
  distance_to_supermarket_km                                                NUMERIC(6,2),
  distance_to_ferry_terminal_km                                             NUMERIC(6,2),
  distance_to_domestic_airport_km                                            NUMERIC(6,2),
  year_round_road_access                                                     BOOLEAN DEFAULT TRUE,
  four_wd_required                                                            BOOLEAN DEFAULT FALSE,

  -- Sustainability
  eco_certified                                                                BOOLEAN DEFAULT FALSE,
  eco_certification_body                                                        TEXT,  -- e.g. 'Green Globe', 'EarthCheck' — not Pacific-specific, see §1.18

  -- Pricing (JSONB, per-season — matches endpoints.pricing_tiers JSONB convention)
  nightly_rate_ranges                                                            JSONB DEFAULT '{}'::JSONB,  -- {"low_season": {"min": 80, "max": 150, "currency": "FJD"}, "peak_season": {...}}

  -- NFT / TipTide stubs — NOT YET IMPLEMENTED (per task brief: schema stub only)
  nft_discount_active                                                             BOOLEAN DEFAULT FALSE,
  nft_discount_percentage                                                          NUMERIC(5,2),
  local_resident_rate_available                                                     BOOLEAN DEFAULT FALSE,
  local_resident_rate_notes                                                          TEXT,
  loyalty_program_active                                                             BOOLEAN DEFAULT FALSE,
  loyalty_program_notes                                                              TEXT,

  -- Status / provenance
  is_active                                                                          BOOLEAN DEFAULT FALSE,
  source_type                                                                        TEXT NOT NULL DEFAULT 'provider_self_listed' CHECK (source_type IN ('curated', 'provider_self_listed', 'hybrid')),
  data_source                                                                         TEXT,
  last_verified                                                                        DATE,

  created_at                                                                           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                                                                            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tourism_accommodations_nation ON tourism_accommodations(nation_code);
CREATE INDEX idx_tourism_accommodations_type ON tourism_accommodations(property_type);
CREATE INDEX idx_tourism_accommodations_active ON tourism_accommodations(is_active);
CREATE INDEX idx_tourism_accommodations_conference ON tourism_accommodations(conference_facilities) WHERE conference_facilities = TRUE;
CREATE INDEX idx_tourism_accommodations_wedding ON tourism_accommodations(wedding_venue) WHERE wedding_venue = TRUE;
CREATE INDEX idx_tourism_accommodations_casino ON tourism_accommodations(casino_onsite) WHERE casino_onsite = TRUE;
CREATE INDEX idx_tourism_accommodations_geo ON tourism_accommodations(lat, lon);

ALTER TABLE tourism_accommodations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_accommodations_public_read" ON tourism_accommodations
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "tourism_accommodations_service_write" ON tourism_accommodations
  FOR ALL TO service_role USING (true);
CREATE TRIGGER tourism_accommodations_updated_at
  BEFORE UPDATE ON tourism_accommodations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

*Note on the "casino/conference/wedding on every accommodation row" design:* most properties will have these flags `FALSE` — this is intentional denormalisation so `GET /tourism/accommodation/{nation}?conference=true` is a single indexed filter rather than a join, matching the brief's own performance requirement.

### Table 3 — `tourism_activities`

```sql
CREATE TABLE IF NOT EXISTS tourism_activities (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code           TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  provider_id            UUID REFERENCES providers(id) ON DELETE CASCADE,
  endpoint_id              UUID REFERENCES endpoints(id) ON DELETE SET NULL,

  activity_name             TEXT NOT NULL,
  activity_type              TEXT NOT NULL CHECK (activity_type IN (
                               'dive_site', 'snorkel_site', 'surf_break', 'whale_watching',
                               'cultural', 'hiking', 'fishing_charter', 'water_sport',
                               'day_trip', 'out_to_island', 'market_tour', 'village_immersion',
                               'cooking_class', 'craft_workshop', 'film_location'
                             )),

  island                      TEXT,
  lat                           NUMERIC(9,6),  -- join key for NOAA coral/ocean-temp queries, see §0.3/§3.12
  lon                           NUMERIC(9,6),

  skill_level_required           TEXT CHECK (skill_level_required IN ('none', 'beginner', 'intermediate', 'advanced', 'expert', NULL)),
  certification_required          BOOLEAN DEFAULT FALSE,
  certification_type               TEXT,  -- 'PADI Open Water', 'PADI Advanced', etc.
  season_start_month               INTEGER CHECK (season_start_month BETWEEN 1 AND 12),
  season_end_month                  INTEGER CHECK (season_end_month BETWEEN 1 AND 12),
  in_water_swimming_permitted        BOOLEAN,  -- whale-watching specific, see Tonga §1.5 — NULL for non-applicable activity_types

  price_min                           NUMERIC(10,2),
  price_max                           NUMERIC(10,2),
  price_currency                       TEXT,
  price_per_person                     BOOLEAN DEFAULT TRUE,
  group_size_min                       INTEGER,
  group_size_max                       INTEGER,

  operator_name                        TEXT,
  operator_contact                     JSONB DEFAULT '{}'::JSONB,  -- {"phone":..., "email":..., "website":...}

  marine_life_highlights                TEXT[],
  natural_highlights                     TEXT[],

  -- Hazard flags — denormalised pointer, full detail lives in tourism_hazards
  has_marine_hazards                      BOOLEAN DEFAULT FALSE,
  hazard_summary                           TEXT,

  -- Depth / visibility / wreck detail (dive-specific; NULL for non-dive activity_types)
  depth_min_m                               NUMERIC(5,1),
  depth_max_m                               NUMERIC(5,1),
  is_wreck_dive                              BOOLEAN DEFAULT FALSE,
  wreck_name                                 TEXT,
  wreck_history                              TEXT,
  dive_profile                               TEXT CHECK (dive_profile IN ('wall', 'drift', 'cave', 'reef', 'wreck', NULL)),

  accessibility_rating                        TEXT,
  film_connection                              BOOLEAN DEFAULT FALSE,
  film_connection_notes                        TEXT,  -- e.g. 'Survivor: Samoa (US S19/20/23/24), Upolu'

  is_active                                     BOOLEAN DEFAULT FALSE,
  source_type                                    TEXT NOT NULL DEFAULT 'provider_self_listed' CHECK (source_type IN ('curated', 'provider_self_listed', 'hybrid')),
  data_source                                     TEXT,
  last_verified                                    DATE,

  created_at                                        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                                        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tourism_activities_nation ON tourism_activities(nation_code);
CREATE INDEX idx_tourism_activities_type ON tourism_activities(activity_type);
CREATE INDEX idx_tourism_activities_geo ON tourism_activities(lat, lon);
CREATE INDEX idx_tourism_activities_season ON tourism_activities(season_start_month, season_end_month);
CREATE INDEX idx_tourism_activities_active ON tourism_activities(is_active);

ALTER TABLE tourism_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_activities_public_read" ON tourism_activities
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "tourism_activities_service_write" ON tourism_activities
  FOR ALL TO service_role USING (true);
CREATE TRIGGER tourism_activities_updated_at
  BEFORE UPDATE ON tourism_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Table 4 — `tourism_food_beverage`

```sql
CREATE TABLE IF NOT EXISTS tourism_food_beverage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code        TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  provider_id          UUID REFERENCES providers(id) ON DELETE CASCADE,
  endpoint_id            UUID REFERENCES endpoints(id) ON DELETE SET NULL,

  venue_name               TEXT NOT NULL,
  venue_type                TEXT NOT NULL CHECK (venue_type IN (
                              'restaurant', 'bar', 'market_stall', 'food_tour', 'catering', 'kava_bar'
                            )),
  cuisine_type               TEXT[],  -- 'traditional_pacific', 'western', 'chinese', 'indian', 'japanese', 'fusion'
  traditional_dishes_offered  TEXT[],
  dietary_options              TEXT[], -- 'vegetarian','vegan','halal','gluten_free','dairy_free'
  dining_tier                    TEXT CHECK (dining_tier IN ('casual', 'mid_range', 'fine_dining', 'buffet', 'street_food')),
  locally_sourced_flag             BOOLEAN DEFAULT FALSE,
  seafood_speciality_flag           BOOLEAN DEFAULT FALSE,
  signature_cocktails                 TEXT[],
  local_spirits_featured               TEXT[],
  kava_available                        BOOLEAN DEFAULT FALSE,
  kava_type                              TEXT CHECK (kava_type IN ('ceremonial', 'social', NULL)),
  rating_source                           TEXT,
  rating_score                             NUMERIC(3,1),
  price_range_min                          NUMERIC(10,2),
  price_range_max                          NUMERIC(10,2),
  price_currency                           TEXT,
  byo_permitted                             BOOLEAN DEFAULT FALSE,
  alcohol_licence_status                     TEXT,
  operating_hours                            JSONB DEFAULT '{}'::JSONB,  -- {"monday": "11:00-22:00", ..., "sunday": "closed"}
  seating_capacity                            INTEGER,
  reservations_required                        BOOLEAN DEFAULT FALSE,
  delivery_available                           BOOLEAN DEFAULT FALSE,
  caters_for_events                             BOOLEAN DEFAULT FALSE,
  catering_max_capacity                          INTEGER,

  island                                          TEXT,
  lat                                              NUMERIC(9,6),
  lon                                              NUMERIC(9,6),
  distance_to_tourist_area_km                       NUMERIC(6,2),
  accessible                                         BOOLEAN,
  parking_available                                   BOOLEAN,

  -- NFT stubs
  nft_discount_active                                  BOOLEAN DEFAULT FALSE,
  nft_discount_percentage                               NUMERIC(5,2),
  local_resident_rate_available                          BOOLEAN DEFAULT FALSE,
  local_resident_rate_notes                               TEXT,

  is_active                                                BOOLEAN DEFAULT FALSE,
  source_type                                               TEXT NOT NULL DEFAULT 'provider_self_listed' CHECK (source_type IN ('curated', 'provider_self_listed', 'hybrid')),
  data_source                                                TEXT,
  last_verified                                               DATE,

  created_at                                                   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                                                   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tourism_fb_nation ON tourism_food_beverage(nation_code);
CREATE INDEX idx_tourism_fb_type ON tourism_food_beverage(venue_type);
CREATE INDEX idx_tourism_fb_cuisine_gin ON tourism_food_beverage USING GIN (cuisine_type);
CREATE INDEX idx_tourism_fb_dietary_gin ON tourism_food_beverage USING GIN (dietary_options);
CREATE INDEX idx_tourism_fb_active ON tourism_food_beverage(is_active);

ALTER TABLE tourism_food_beverage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_fb_public_read" ON tourism_food_beverage
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "tourism_fb_service_write" ON tourism_food_beverage
  FOR ALL TO service_role USING (true);
CREATE TRIGGER tourism_fb_updated_at
  BEFORE UPDATE ON tourism_food_beverage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Table 5 — `tourism_transport`

```sql
CREATE TABLE IF NOT EXISTS tourism_transport (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code      TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  provider_id        UUID REFERENCES providers(id) ON DELETE CASCADE,
  endpoint_id          UUID REFERENCES endpoints(id) ON DELETE SET NULL,

  transport_type        TEXT NOT NULL CHECK (transport_type IN (
                          'ferry', 'domestic_airline', 'inter_island_transfer',
                          'airport_transfer', 'car_hire', 'boat_charter'
                        )),
  origin                 TEXT NOT NULL,
  destination              TEXT NOT NULL,
  operator_name             TEXT,
  frequency                  TEXT CHECK (frequency IN ('daily', 'weekly', 'seasonal', 'on_demand')),
  duration_minutes             INTEGER,
  price_min                     NUMERIC(10,2),
  price_max                     NUMERIC(10,2),
  price_currency                 TEXT,
  booking_method                  TEXT CHECK (booking_method IN ('online', 'phone', 'in_person')),
  vessel_or_aircraft_type           TEXT,
  passenger_capacity                 INTEGER,
  reliability_notes                   TEXT,
  safety_certification_status          TEXT,

  is_active                             BOOLEAN DEFAULT FALSE,
  source_type                            TEXT NOT NULL DEFAULT 'provider_self_listed' CHECK (source_type IN ('curated', 'provider_self_listed', 'hybrid')),
  data_source                             TEXT,
  last_verified                            DATE,

  created_at                                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tourism_transport_nation ON tourism_transport(nation_code);
CREATE INDEX idx_tourism_transport_route ON tourism_transport(origin, destination);
CREATE INDEX idx_tourism_transport_type ON tourism_transport(transport_type);

ALTER TABLE tourism_transport ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_transport_public_read" ON tourism_transport
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "tourism_transport_service_write" ON tourism_transport
  FOR ALL TO service_role USING (true);
CREATE TRIGGER tourism_transport_updated_at
  BEFORE UPDATE ON tourism_transport
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Table 6 — `tourism_events` (migration target for existing `pacific_events`)

```sql
-- Migration: extend pacific_events in place rather than create a parallel table.
ALTER TABLE pacific_events RENAME TO tourism_events;

ALTER TABLE tourism_events
  ADD COLUMN IF NOT EXISTS event_type TEXT,  -- broader enum than the original `category` column
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'curated'
    CHECK (source_type IN ('curated', 'provider_self_listed', 'hybrid')),
  ADD COLUMN IF NOT EXISTS endpoint_id UUID REFERENCES endpoints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ticketed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS price_min NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_max NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_currency TEXT,
  ADD COLUMN IF NOT EXISTS tourist_friendly_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS website TEXT;

-- Backfill event_type from the existing narrower `category` CHECK values, extended to:
-- 'cultural_festival','sporting','business_conference','religious','christmas_new_year',
-- 'independence_day','agricultural_show','music_festival','food_festival'
UPDATE tourism_events SET event_type = category WHERE event_type IS NULL;

ALTER TABLE tourism_events ALTER COLUMN event_type SET NOT NULL;
ALTER TABLE tourism_events ADD CONSTRAINT tourism_events_event_type_check CHECK (event_type IN (
  'cultural_festival', 'sporting', 'business_conference', 'religious',
  'christmas_new_year', 'independence_day', 'agricultural_show',
  'music_festival', 'food_festival', 'festival', 'concert', 'sport',
  'cultural', 'political', 'business', 'other'
));

CREATE INDEX IF NOT EXISTS idx_tourism_events_event_type ON tourism_events(event_type);
```

*(Rows for Palau, French Polynesia, Marshall Islands, FSM, Kiribati, Niue — currently zero events seeded per §1.10 — are a direct data-entry task once this migration lands, not a schema change.)*

### Table 7 — `tourism_hazards`

```sql
CREATE TABLE IF NOT EXISTS tourism_hazards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code     TEXT NOT NULL REFERENCES tourism_destinations(nation_code),

  hazard_type       TEXT NOT NULL CHECK (hazard_type IN (
                       'riptide', 'jellyfish', 'box_jellyfish', 'shark', 'stonefish',
                       'cone_snail', 'crocodile', 'crown_of_thorns', 'strong_current',
                       'cyclone', 'tsunami', 'flood', 'volcanic', 'earthquake',
                       'dengue', 'malaria', 'zika', 'uv_extreme', 'unsafe_water', 'mosquito'
                     )),
  island             TEXT,
  specific_location    TEXT,
  lat                   NUMERIC(9,6),
  lon                   NUMERIC(9,6),

  risk_level             TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  season_or_period         TEXT,  -- 'year_round', 'wet_season', 'nov_apr', etc.
  notes                      TEXT,

  -- Volatile-hazard fields (volcanic alert level, advisory-linked hazards) need
  -- their own fast-refresh timestamp distinct from the generic last_verified
  is_volatile                 BOOLEAN DEFAULT FALSE,  -- true for volcanic/cyclone-active/tsunami-watch type rows
  live_source_url               TEXT,  -- e.g. vmgd.gov.vu/warnings/volcano for Vanuatu volcanic rows

  mitigation_advice              TEXT,
  source                           TEXT NOT NULL,
  last_verified                     DATE NOT NULL,

  created_at                          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tourism_hazards_nation ON tourism_hazards(nation_code);
CREATE INDEX idx_tourism_hazards_type ON tourism_hazards(hazard_type);
CREATE INDEX idx_tourism_hazards_risk ON tourism_hazards(risk_level);
CREATE INDEX idx_tourism_hazards_volatile ON tourism_hazards(is_volatile) WHERE is_volatile = TRUE;

ALTER TABLE tourism_hazards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_hazards_public_read" ON tourism_hazards
  FOR SELECT TO anon, authenticated USING (true);  -- safety data — always public, no is_active gate
CREATE POLICY "tourism_hazards_service_write" ON tourism_hazards
  FOR ALL TO service_role USING (true);
CREATE TRIGGER tourism_hazards_updated_at
  BEFORE UPDATE ON tourism_hazards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Table 8 — `tourism_health_infrastructure`

```sql
CREATE TABLE IF NOT EXISTS tourism_health_infrastructure (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code         TEXT NOT NULL REFERENCES tourism_destinations(nation_code),

  facility_type         TEXT NOT NULL CHECK (facility_type IN (
                           'hospital_surgical', 'clinic_basic', 'pharmacy',
                           'decompression_chamber', 'dental', 'evacuation_service'
                         )),
  facility_name           TEXT NOT NULL,
  island                    TEXT,
  lat                         NUMERIC(9,6),
  lon                         NUMERIC(9,6),
  distance_to_tourist_area_km  NUMERIC(6,2),

  contact_phone                 TEXT,
  contact_notes                  TEXT,
  operating_hours                  TEXT,
  services_available                 TEXT[],

  -- Decompression-chamber-specific — the brief's own "CRITICAL for dive agents"
  -- flag means existence alone is not enough; operational status must be explicit
  -- (see §1.12's Solomon Islands finding — a chamber can exist and still be down)
  operational_status                  TEXT CHECK (operational_status IN (
                                         'operational', 'not_operational', 'unknown', NULL
                                       )),
  operational_status_notes              TEXT,

  cost_consultation_usd                  NUMERIC(10,2),
  cost_emergency_room_usd                 NUMERIC(10,2),
  cost_hospitalisation_per_night_usd        NUMERIC(10,2),
  cost_decompression_treatment_usd           NUMERIC(10,2),

  medical_evacuation_capable                   BOOLEAN DEFAULT FALSE,
  blood_bank_available                           BOOLEAN DEFAULT FALSE,

  source                                           TEXT NOT NULL,
  last_verified                                      DATE NOT NULL,

  created_at                                           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                                           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tourism_health_nation ON tourism_health_infrastructure(nation_code);
CREATE INDEX idx_tourism_health_type ON tourism_health_infrastructure(facility_type);
CREATE INDEX idx_tourism_health_chamber ON tourism_health_infrastructure(facility_type, operational_status)
  WHERE facility_type = 'decompression_chamber';

ALTER TABLE tourism_health_infrastructure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_health_public_read" ON tourism_health_infrastructure
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_health_service_write" ON tourism_health_infrastructure
  FOR ALL TO service_role USING (true);
CREATE TRIGGER tourism_health_updated_at
  BEFORE UPDATE ON tourism_health_infrastructure
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Table 9 — `tourism_cultural_protocols`

```sql
CREATE TABLE IF NOT EXISTS tourism_cultural_protocols (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code             TEXT NOT NULL REFERENCES tourism_destinations(nation_code) UNIQUE,  -- one row per nation; site-specific overrides below

  dress_code_general         TEXT,
  dress_code_site_specific     JSONB DEFAULT '[]'::JSONB,  -- [{site, rule}]
  sacred_sites                   JSONB DEFAULT '[]'::JSONB,  -- [{name, location, visitor_rules}]
  photography_restrictions_general TEXT,
  photography_restrictions_locations JSONB DEFAULT '[]'::JSONB,

  -- Sunday/religious observance — load-bearing, legally and socially, for
  -- Samoa and Tonga specifically (§1.21) — kept as free text because the
  -- real-world rule is nuanced (e.g. Samoa: stores/restaurants closed,
  -- hotels permitted 10am-midnight with Board approval) and a boolean would
  -- misrepresent it
  sunday_restrictions           TEXT,

  village_visit_protocols          TEXT,
  gift_giving_customs                TEXT,
  kava_ceremony_protocols              TEXT,
  kava_decline_etiquette                 TEXT,
  taboo_behaviours                         TEXT[],
  church_visit_etiquette                     TEXT,
  traditional_greetings                        TEXT,

  source                                          TEXT NOT NULL,
  last_verified                                     DATE NOT NULL,

  created_at                                          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                                          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tourism_protocols_nation ON tourism_cultural_protocols(nation_code);

ALTER TABLE tourism_cultural_protocols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_protocols_public_read" ON tourism_cultural_protocols
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_protocols_service_write" ON tourism_cultural_protocols
  FOR ALL TO service_role USING (true);
CREATE TRIGGER tourism_protocols_updated_at
  BEFORE UPDATE ON tourism_cultural_protocols
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Table 10 — `tourism_markets`

```sql
CREATE TABLE IF NOT EXISTS tourism_markets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code    TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  provider_id      UUID REFERENCES providers(id) ON DELETE CASCADE,  -- NULL for curated flagship markets

  market_name       TEXT NOT NULL,
  island               TEXT,
  town                   TEXT,
  lat                      NUMERIC(9,6),
  lon                      NUMERIC(9,6),

  market_type                TEXT NOT NULL CHECK (market_type IN (
                                'produce', 'craft', 'fish', 'mixed', 'flea', 'night_market'
                              )),
  operating_days                TEXT[],
  operating_hours                  TEXT,
  payment_accepted                   TEXT CHECK (payment_accepted IN ('cash_only', 'card', 'both')),
  covered_or_open_air                  TEXT CHECK (covered_or_open_air IN ('covered', 'open_air', 'both')),
  distance_to_tourist_area_km            NUMERIC(6,2),
  signature_products                       TEXT[],
  guided_tours_available                     BOOLEAN DEFAULT FALSE,
  guided_tour_operator                         TEXT,
  guided_tour_price                              NUMERIC(10,2),
  accessible                                       BOOLEAN,
  parking_available                                  BOOLEAN,
  best_time_to_visit_notes                             TEXT,

  is_active                                              BOOLEAN DEFAULT TRUE,
  source_type                                              TEXT NOT NULL DEFAULT 'curated' CHECK (source_type IN ('curated', 'provider_self_listed', 'hybrid')),
  data_source                                               TEXT,
  last_verified                                               DATE,

  created_at                                                    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                                                    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tourism_markets_nation ON tourism_markets(nation_code);
CREATE INDEX idx_tourism_markets_type ON tourism_markets(market_type);

ALTER TABLE tourism_markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_markets_public_read" ON tourism_markets
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "tourism_markets_service_write" ON tourism_markets
  FOR ALL TO service_role USING (true);
CREATE TRIGGER tourism_markets_updated_at
  BEFORE UPDATE ON tourism_markets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Table 11 — `tourism_weddings`

```sql
CREATE TABLE IF NOT EXISTS tourism_weddings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code          TEXT NOT NULL REFERENCES tourism_destinations(nation_code) UNIQUE,

  residency_waiting_period_days INTEGER DEFAULT 0,
  min_days_in_country_before_ceremony INTEGER,
  application_lead_time_days      INTEGER,
  documents_required                TEXT[],

  legally_binding_available           BOOLEAN,
  legally_binding_celebrant_requirements TEXT,
  symbolic_only_available               BOOLEAN,

  beach_permit_required                   BOOLEAN,
  beach_permit_issuing_authority             TEXT,
  beach_permit_cost_usd                        NUMERIC(10,2),
  beach_permit_lead_time_days                    INTEGER,

  traditional_ceremony_elements                    TEXT[],
  licensed_wedding_planners                          JSONB DEFAULT '[]'::JSONB,  -- [{name, website}]
  honeymoon_package_culture_notes                       TEXT,
  vow_renewal_programs_available                          BOOLEAN DEFAULT FALSE,

  minimum_age                                               INTEGER,
  minimum_age_with_parental_consent                            INTEGER,
  same_sex_marriage_permitted                                   BOOLEAN,

  source                                                          TEXT NOT NULL,
  last_verified                                                     DATE NOT NULL,

  created_at                                                          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                                                          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tourism_weddings_nation ON tourism_weddings(nation_code);

ALTER TABLE tourism_weddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_weddings_public_read" ON tourism_weddings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_weddings_service_write" ON tourism_weddings
  FOR ALL TO service_role USING (true);
CREATE TRIGGER tourism_weddings_updated_at
  BEFORE UPDATE ON tourism_weddings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Table 12 — `tourism_providers`

```sql
CREATE TABLE IF NOT EXISTS tourism_providers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id            UUID NOT NULL UNIQUE REFERENCES providers(id) ON DELETE CASCADE,
  -- 1:1 extension of the existing `providers` table (see design decision #2
  -- above) — contact_email, wallet_address, trust_tier, onboarding_status,
  -- fee_collection_consent etc. all already exist on `providers` and are NOT
  -- duplicated here.

  business_legal_name       TEXT NOT NULL,
  tourism_category             TEXT NOT NULL CHECK (tourism_category IN (
                                 'accommodation', 'tour_operator', 'water_activities',
                                 'transport', 'food_beverage', 'conference_events', 'local_guide'
                               )),
  content_table_row_id           UUID,  -- points at the row in whichever category table this provider's own listing lives (tourism_accommodations.id, tourism_activities.id, etc.) — polymorphic by tourism_category, enforced at application layer not FK (matches the brief's "links to relevant category tables")

  nation_code                      TEXT NOT NULL REFERENCES tourism_destinations(nation_code),
  island                             TEXT,

  website                              TEXT,
  social_media                           JSONB DEFAULT '{}'::JSONB,

  registration_fee_paid                    BOOLEAN DEFAULT FALSE,
  registration_fee_amount_usd                 NUMERIC(10,2) DEFAULT 10.00,
  registration_fee_paid_at                      TIMESTAMP WITH TIME ZONE,
  registration_fee_payment_method                 TEXT CHECK (registration_fee_payment_method IN ('usdc_algorand', 'stripe', NULL)),
  registration_fee_tx_ref                           TEXT,  -- Algorand tx id or Stripe payment intent id

  verification_status                                 TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
                                                           'pending', 'verified', 'rejected', 'suspended'
                                                         )),
  verification_notes                                     TEXT,
  verified_at                                              TIMESTAMP WITH TIME ZONE,
  rejection_reason                                           TEXT,

  languages_spoken                                             TEXT[],
  years_operating                                                INTEGER,
  certifications_held                                              TEXT[],
  insurance_held                                                     BOOLEAN DEFAULT FALSE,
  locally_owned                                                        BOOLEAN,
  eco_certified                                                          BOOLEAN DEFAULT FALSE,
  eco_certification_name                                                   TEXT,

  -- NFT / TipTide stubs — NOT YET IMPLEMENTED
  nft_provider_token_issued                                                   BOOLEAN DEFAULT FALSE,
  nft_token_id                                                                  TEXT,
  nft_discount_active                                                            BOOLEAN DEFAULT FALSE,
  nft_discount_percentage                                                         NUMERIC(5,2),
  local_resident_rate_available                                                    BOOLEAN DEFAULT FALSE,
  local_resident_rate_notes                                                          TEXT,
  loyalty_program_active                                                              BOOLEAN DEFAULT FALSE,
  tiptide_wallet_connected                                                             BOOLEAN DEFAULT FALSE,
  tiptide_wallet_address                                                                TEXT,

  created_at                                                                             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                                                                             TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tourism_providers_provider ON tourism_providers(provider_id);
CREATE INDEX idx_tourism_providers_category ON tourism_providers(tourism_category);
CREATE INDEX idx_tourism_providers_nation ON tourism_providers(nation_code);
CREATE INDEX idx_tourism_providers_verification ON tourism_providers(verification_status);

ALTER TABLE tourism_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_providers_public_read" ON tourism_providers
  FOR SELECT TO anon, authenticated USING (verification_status = 'verified');
CREATE POLICY "tourism_providers_service_write" ON tourism_providers
  FOR ALL TO service_role USING (true);
CREATE TRIGGER tourism_providers_updated_at
  BEFORE UPDATE ON tourism_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Table 13 — `tourism_accessibility`

```sql
CREATE TABLE IF NOT EXISTS tourism_accessibility (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nation_code         TEXT NOT NULL REFERENCES tourism_destinations(nation_code) UNIQUE,

  accessible_beaches     JSONB DEFAULT '[]'::JSONB,   -- [{name, location, notes}] — expect near-empty at launch, see §1.17/§5
  accessible_snorkel_entry_points JSONB DEFAULT '[]'::JSONB,
  adaptive_dive_operators    JSONB DEFAULT '[]'::JSONB,  -- [{operator_name, contact}]
  accessible_transport_options TEXT,
  accommodation_accessibility_rating TEXT,  -- free-text general assessment, not a false-precision score
  accessible_cultural_experiences JSONB DEFAULT '[]'::JSONB,

  overall_maturity_rating    INTEGER CHECK (overall_maturity_rating BETWEEN 1 AND 5),
  overall_maturity_notes       TEXT,

  source                          TEXT NOT NULL DEFAULT 'no_public_source_found — provider self-declaration pending',
  last_verified                     DATE,

  created_at                          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tourism_accessibility_nation ON tourism_accessibility(nation_code);

ALTER TABLE tourism_accessibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tourism_accessibility_public_read" ON tourism_accessibility
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tourism_accessibility_service_write" ON tourism_accessibility
  FOR ALL TO service_role USING (true);
CREATE TRIGGER tourism_accessibility_updated_at
  BEFORE UPDATE ON tourism_accessibility
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Index / performance notes

- Every multi-nation query pattern (`GET /tourism/.../pacific`, `GET /tourism/search`) filters on `nation_code` first — every table has that index as its leading column.
- Geo-join tables (`tourism_activities`, `tourism_accommodations`, `tourism_food_beverage`) carry `(lat, lon)` composite indexes to support bounding-box queries matching the coral-bleaching endpoint's own `lat/lon/radius_deg` pattern (§3.12).
- `JSONB` GIN indexes are added only where filtering *inside* the JSON is a real query path (`visa_requirements`, `cuisine_type`, `dietary_options`) — not on every JSONB column, to avoid unnecessary index-maintenance overhead on write-light curated tables.
- `is_active`/`verification_status` partial indexes keep the common "only show live/verified rows" filter cheap without bloating the index on inactive/rejected rows.

---

## PART 3 — ENDPOINT ARCHITECTURE

All endpoints below use `data_category = 'tourism'` (already valid, §0.2) and follow the existing `pdc-x402-adapter` pattern — **never call `@x402` packages directly** (CLAUDE.md §17).

| Endpoint | Method | Key params | Response (summary) | Price (USDC) | Update freq | Source type | Bazaar category | Agent use case |
|---|---|---|---|---|---|---|---|---|
| `/tourism/destination/{nation_code}` | GET | `nation_code` (path) | Full `tourism_destinations` row + joined `tourism_cultural_protocols`, `tourism_hazards` summary | 0.05 | monthly / weekly for volatile sub-fields | curated | Tourism / Destination Profiles | Full-profile trip-planning agent assembling one destination's complete picture |
| `/tourism/destinations/pacific` | GET | none | Array of lightweight `tourism_destinations` rows, all 13 nations | 0.02 | monthly | curated | Tourism / Destination Profiles | Comparison agent ("which Pacific nation fits my criteria") |
| `/tourism/destination/{nation_code}/profile` | GET | `nation_code` | Minimal fields (name, timezone, currency, visa summary) | 0.01 | monthly | curated | Tourism / Destination Profiles | Cheap routing call before a more expensive full query — Tier 1 per Decision 23/60 pattern |
| `/tourism/destination/{nation_code}/advisories` | GET | `nation_code` | Advisory levels + `last_verified` + source URLs (per §1.19 design) | 0.02 | weekly (manual re-verify, not live) | curated | Tourism / Safety | Pre-travel safety check agent |
| `/tourism/accommodation/{nation_code}` | GET | `tier`, `price_min`, `price_max`, `features[]`, `star_rating`, `casino`, `conference`, `wedding`, `pool`, `spa` | Filtered array of `tourism_accommodations` rows | 0.03 | daily (provider rows) / monthly (curated) | hybrid | Tourism / Accommodation | Booking-research agent filtering by traveller requirements |
| `/tourism/accommodation/{nation_code}/conferences` | GET | `min_capacity` | Conference-capable properties only, with capacity/breakout/catering fields | 0.05 | daily | hybrid | Tourism / MICE | Event-planner agent sourcing a Pacific conference venue |
| `/tourism/accommodation/compare` | GET | `nation_codes[]`, `tier` | Cross-nation accommodation comparison | 0.05 | daily | hybrid | Tourism / Accommodation | Multi-destination shopping agent |
| `/tourism/activities/{nation_code}` | GET | `type`, `skill_level`, `season_month`, `price_min`, `price_max`, `certification_required` | Filtered `tourism_activities` rows | 0.03 | daily | hybrid | Tourism / Activities | General activity-planning agent |
| `/tourism/dive/{nation_code}` | GET | `skill_level`, `depth_max`, `wreck_only` | Full dive-site detail incl. depth, cert level, marine-life, live-joined water temp (§3.12) | **0.10 (premium)** | daily | hybrid | Tourism / Dive | Dive-trip planning agent — premium price reflects depth/safety-critical content richness |
| `/tourism/cultural/{nation_code}` | GET | `type` | Fiafia nights, village programs, ceremonies, kava protocols | 0.03 | weekly | hybrid | Tourism / Culture | Cultural-experience booking agent |
| `/tourism/hazards/{nation_code}` | GET | `hazard_type` | Full `tourism_hazards` rows, `is_volatile` rows flagged with live-source link | **0.05** | **real-time for `is_volatile=true` rows (link-out), weekly for the rest** | curated | Tourism / Safety | Risk-assessment agent for trip planning and insurance underwriting |
| `/tourism/health/{nation_code}` | GET | none | Medical infrastructure + decompression chamber operational status + cost estimates | 0.05 | monthly | curated | Tourism / Safety | Dive-insurance and medevac-planning agent — chamber `operational_status` is the critical field (§1.12/§2 Table 8) |
| `/tourism/protocols/{nation_code}` | GET | none | Full `tourism_cultural_protocols` row | 0.02 | annual | curated | Tourism / Culture | Cultural-sensitivity briefing agent |
| `/tourism/food/{nation_code}` | GET | `cuisine`, `tier`, `dietary[]`, `price_min`, `price_max` | Filtered `tourism_food_beverage` rows | 0.03 | daily | hybrid | Tourism / Food & Beverage | Dining-recommendation agent, including dietary-constraint filtering |
| `/tourism/markets/{nation_code}` | GET | `type` | `tourism_markets` rows | 0.02 | weekly | curated | Tourism / Food & Beverage | Day-trip/shopping-itinerary agent |
| `/tourism/transport/{nation_code}` | GET | `transport_type` | `tourism_transport` rows for the nation | 0.03 | weekly | hybrid | Tourism / Transport | Inter-island logistics agent |
| `/tourism/transport/routes` | GET | `origin`, `destination` | Cross-nation route lookup | 0.03 | weekly | hybrid | Tourism / Transport | Multi-leg itinerary-builder agent |
| `/tourism/events/{nation_code}` | GET | `start_date`, `end_date`, `event_type` | `tourism_events` rows in range | 0.02 | weekly | curated | Tourism / Events | Date-driven trip-timing agent |
| `/tourism/events/pacific/christmas` | GET | `year` | Christmas/New Year events across all 13 nations | **0.05 (seasonal premium)** | annual (re-seeded each year) | curated | Tourism / Events | High-value seasonal query — diaspora travel-planning agents |
| `/tourism/weddings/{nation_code}` | GET | none | `tourism_weddings` row | 0.03 | annual | curated | Tourism / Weddings | Destination-wedding planning agent — see §1.20's hard verification requirement before this goes live for any nation beyond Fiji/Cook Islands |
| `/tourism/search` | GET | `destination`, `activity_type`, `season`, `budget_per_day`, `group_size`, `features[]`, `dietary`, `accessibility_required`, `casino`, `conference`, `wedding` | Cross-table, cross-nation ranked results | **0.05** | real-time query over daily-refreshed indices | hybrid | Tourism / Search | The primary agent-facing discovery endpoint — equivalent to the brief's own cross-cutting search requirement |
| `/tourism/itinerary/suggest` | GET/POST | preference payload | Multi-stop routing suggestion across nations | **0.10 (premium, compute-heavy)** | real-time | hybrid | Tourism / Itinerary | Full itinerary-builder agent — the highest-value, most compute-intensive endpoint in the category |
| `/tourism/providers/{nation_code}` | GET | `category` | Verified `tourism_providers` rows for the nation | 0.02 | daily | provider_listed | Tourism / Providers | Provider-directory browsing agent |
| `/tourism/providers/category/{category}` | GET | `nation_code` (optional filter) | Verified providers of one category, all nations | 0.02 | daily | provider_listed | Tourism / Providers | Category-specific sourcing agent (e.g. "find me dive operators across the whole Pacific") |

### 3.1 How provider-listed data surfaces alongside curated data

Every response from a `hybrid` or `provider_listed` endpoint includes, per record:
```json
{
  "source_type": "provider_self_listed",
  "trust_tier": "silver",
  "verification_status": "verified",
  "provider_badge": "Community Verified — 4 buyers"
}
```
This mirrors the existing Bronze/Silver/Gold display convention (CLAUDE.md §8) exactly — no new trust-signal vocabulary is introduced for tourism. A `curated` row instead carries `"source_type": "curated", "data_source": "SPTO / World Bank", "last_verified": "2026-10-01"` in the same position, so an agent can treat the field uniformly regardless of which kind of row it got back.

### 3.12 Coral bleaching / dive / hazard join pattern

The existing `/climate/pacific-coral-bleaching` endpoint takes `lat`, `lon`, `radius_deg` — **not** a nation code (§0.3). `/tourism/dive/{nation_code}` must, for each dive site in its response, make an internal server-side call to that endpoint using the site's own `lat`/`lon` (stored on `tourism_activities`, §2 Table 3) and attach the live bleaching-alert level and current ocean temperature to the response. The join key is **coordinates, not country** — a dive site 2km offshore may return meaningfully different reef-health data than the country-level average, which is exactly why this has to be a live per-site call rather than a stored per-nation value. Same pattern applies to `/tourism/hazards/{nation_code}`'s marine-hazard rows where a `lat`/`lon` is available (crocodile/shark/current zones).

### 3.13 FX join pattern for currency-aware pricing

`/finance/fx` (§0.3) already serves WST/FJD/TOP/VUV/XPF/PGK/SBD against USD/AUD/NZD. Accommodation and activity endpoints should **never store a converted price** — `tourism_accommodations.nightly_rate_ranges` and `tourism_activities.price_*` store the rate in its **native local currency only** (as self-declared by the provider or curated in local currency), and any agent wanting AUD/NZD/USD equivalents calls `/finance/fx?from={native_currency}&to={target_currency}&amount={price}` itself. This avoids a second, inevitably-stale copy of exchange-rate logic living inside the tourism tables.

---

## PART 4 — PROVIDER REGISTRATION FORM TEMPLATES

All seven forms share the same **Registration and Verification Section** (below), appended after the category-specific fields. Every field maps to a column in the relevant Part 2 table. Input types are drawn from: `text`, `number`, `select`, `multi-select`, `boolean`, `rich_text`, `file_upload`, `url`, `phone`, `email`, `address`.

### 4.1 Accommodation

| Field label | Type | Req? | Help text | Validation | Maps to |
|---|---|---|---|---|---|
| Property name | text | Required | "The name guests see when they book" | 2–200 chars | `tourism_accommodations.property_name` |
| Property type | select | Required | Choose the closest match | one of enum | `property_type` |
| Island | text | Required | | — | `island` |
| Town / district | text | Required | | — | `town_or_district` |
| Address / map pin | address | Required | "Drop a pin — this sets your proximity data automatically" | valid lat/lon | `lat`, `lon` |
| Contact email | email | Required | | valid email | `providers.contact_email` (existing table) |
| Contact phone | phone | Required | | E.164 format | `providers.contact_phone`-equivalent |
| Website | url | Optional | | valid URL | `tourism_providers.website` |
| Years operating | number | Optional | | ≥0, integer | `years_operating` |
| Locally owned | boolean | Required | "Is this property majority-owned by a citizen or permanent resident of this nation?" | — | `locally_owned` |
| International chain affiliation | select (or "none") | Optional | | free text if not in list | `international_chain` |
| Self-declared star rating | select 1–5 | Optional | "There is no official Pacific star-rating body for most nations — this is your own honest assessment" | 1–5 | `star_rating_self_declared` |
| Total room count | number | Required | | ≥1 | `room_count_total` |
| Room breakdown | multi-field number | Required | "Enter counts for each room type you have — leave 0 for types you don't offer" | sum ≤ total | `room_breakdown` |
| Pool | boolean + sub-fields (count, type, adults-only, swim-up bar) | Optional | | — | `pool_*` |
| Spa | boolean + services multi-select + local-treatments boolean | Optional | | — | `spa_*` |
| Gym | boolean | Optional | | — | `gym_available` |
| Kids club | boolean + age range | Optional | | — | `kids_club_*` |
| Accessible rooms | number | Optional | "How many rooms have step-free access and an accessible bathroom?" | ≥0 | `accessible_room_count` |
| Accessibility features | multi-select | Optional | | — | `accessibility_features` |
| Restaurant on-site | boolean + sub-fields (cuisine, open to non-guests, tier, traditional dishes, cocktails, kava bar, dietary options, rating source/score, BYO, alcohol licence) | Optional | "Fill in the restaurant section only if you have one" | — | `restaurant_*`, `alcohol_licence_status` |
| Bar | boolean + sub-fields (beachfront, swim-up, happy hour) | Optional | | — | `bar_*` |
| Casino on-site | boolean + sub-fields (type, hours, dress code, min age) | Optional | "Only applicable if your property legally operates gaming" | min age ≥18 | `casino_*` |
| Conference facilities | boolean + sub-fields (max capacity, breakout rooms, AV standard, in-house catering, outdoor capacity) | Optional | | capacity ≥1 if true | `conference_*` |
| Wedding venue | boolean + sub-fields (ceremony types, beach permit held, traditional elements, honeymoon packages) | Optional | | — | `wedding_*` |
| Water sports hire on-site | boolean | Optional | | — | `water_sports_equipment_hire_onsite` |
| Airport transfer | select (included / fee / not available) + fee amount | Required | | fee ≥0 if "fee" | `airport_transfer`, `airport_transfer_fee_usd` |
| Currency exchange on-site | boolean | Optional | | — | `currency_exchange_onsite` |
| Laundry service | boolean | Optional | | — | `laundry_service` |
| Sustainability certification | boolean + certifying body name | Optional | | — | `eco_certified`, `eco_certification_body` |
| Nightly rate ranges | rich structured input (per season, min/max, currency) | Required | "Enter in your local currency — PDC converts for international buyers automatically" | min ≤ max | `nightly_rate_ranges` |
| **NFT discount offering** | boolean | Optional, default false | "Coming soon — NFT loyalty integration with TipTide wallet. Toggle on if you'd like to be notified when this launches." | — | `nft_discount_active` (stub) |
| **Local resident rate** | boolean + notes (text) | Optional | "Do you offer a discounted rate to residents of this nation?" | — | `local_resident_rate_available`, `local_resident_rate_notes` |

### 4.2 Tour Operator

| Field label | Type | Req? | Help text | Validation | Maps to |
|---|---|---|---|---|---|
| Tour types offered | multi-select | Required | day tours / cultural / adventure / multi-day / out-to-island / film location / market tour | — | `tourism_activities.activity_type` (one row created per tour type offered) |
| Itinerary options | rich_text | Required | "Describe each tour option as guests will see it" | — | activity description fields |
| Group size min/max | number pair | Required | | min ≤ max | `group_size_min/max` |
| Pricing | number pair + currency | Required | | min ≤ max | `price_min/max`, `price_currency` |
| Season availability | month range multi-select | Optional | | — | `season_start_month/end_month` |
| Certifications held | multi-select + file upload | Optional | "Upload a copy of any relevant guide/safety certification" | — | `tourism_providers.certifications_held` |
| Insurance held | boolean + file upload | Required | "Public liability insurance is required to register" | file required if true | `tourism_providers.insurance_held` |
| Languages spoken | multi-select | Required | | ≥1 | `tourism_providers.languages_spoken` |
| Sustainability practices | rich_text | Optional | | — | notes field |
| Vehicle/equipment type | text | Optional | | — | notes field |
| Accessibility options | multi-select | Optional | | — | `tourism_activities.accessibility_rating` |
| Pickup/dropoff service | boolean | Optional | | — | notes field |
| Survivor/film connection | boolean + notes | Optional | "Has this tour visited a known film/TV location?" | — | `film_connection`, `film_connection_notes` |

### 4.3 Water Activities

| Field label | Type | Req? | Help text | Validation | Maps to |
|---|---|---|---|---|---|
| Activity types | multi-select | Required | dive / snorkel / surf / whale watching / fishing charter / windsurf-kitesurf / kayak hire | — | `activity_type` |
| Certification held (operator level) | select (PADI/SSI/NAUI + level) | Required for dive operators | "This is self-declared — PDC does not verify directly with PADI/SSI/NAUI" | — | `tourism_providers.certifications_held` |
| Equipment quality/age | text | Optional | | — | notes |
| Site names covered | multi-select or free text | Required | | — | links to `tourism_activities` rows |
| Skill levels catered for | multi-select | Required | | — | `skill_level_required` |
| Group sizes | number pair | Required | | min ≤ max | `group_size_min/max` |
| Pricing | number pair + currency | Required | | — | `price_min/max` |
| Season dates | month range | Optional | | — | `season_start_month/end_month` |
| **Decompression chamber access** | select (named facility) + distance (km) + emergency protocol (rich_text) | **Required for dive operators** | "Which chamber would you or your guests be taken to in an emergency? See the PDC Health & Safety reference for your nation." | **required if activity_types includes dive** | `tourism_health_infrastructure` lookup + operator-declared protocol notes |
| Safety briefing standard | rich_text | Required | | — | notes |
| Rescue certification held | boolean + file upload | Required | | — | `tourism_providers.certifications_held` |
| Accessible options | multi-select | Optional | | — | `tourism_activities.accessibility_rating` |
| Marine guide qualifications | text | Optional | | — | notes |

### 4.4 Transport

| Field label | Type | Req? | Help text | Validation | Maps to |
|---|---|---|---|---|---|
| Routes served | multi-entry (origin, destination) | Required | | ≥1 route | `tourism_transport.origin/destination` |
| Vessel/vehicle type and capacity | text + number | Required | | capacity ≥1 | `vessel_or_aircraft_type`, `passenger_capacity` |
| Frequency and schedule | select + rich_text | Required | | — | `frequency` |
| Pricing per route | number pair + currency, per route | Required | | — | `price_min/max` |
| Booking method | select | Required | | — | `booking_method` |
| Safety certification status | text + file upload | Optional | | — | `safety_certification_status` |
| Accessibility features | multi-select | Optional | | — | notes |
| Luggage allowance | text | Optional | | — | notes |
| Fuel policy (hire vehicles only) | select | Conditional | | required if transport_type = car_hire | notes |
| Emergency contact and procedures | phone + rich_text | Required | | — | `tourism_providers` contact fields |

### 4.5 Food and Beverage

| Field label | Type | Req? | Help text | Validation | Maps to |
|---|---|---|---|---|---|
| Venue type | select | Required | | — | `venue_type` |
| Cuisine type | multi-select | Required | | — | `cuisine_type` |
| Traditional dishes offered | multi-select + free text | Optional | | — | `traditional_dishes_offered` |
| Dining tier | select | Required | | — | `dining_tier` |
| Dietary options | multi-select | Optional | | — | `dietary_options` |
| Signature cocktails | multi-select/free text | Optional | | — | `signature_cocktails` |
| Local spirits featured | multi-select/free text | Optional | | — | `local_spirits_featured` |
| Kava available | boolean + type (ceremonial/social) | Optional | | — | `kava_available`, `kava_type` |
| BYO permitted | boolean | Optional | | — | `byo_permitted` |
| Alcohol licence status | text + file upload | Required if serving alcohol | | — | `alcohol_licence_status` |
| Opening hours | structured per-day input | Required | | — | `operating_hours` |
| Price range per person | number pair + currency | Required | | — | `price_range_min/max` |
| Locally sourced ingredients | boolean | Optional | | — | `locally_sourced_flag` |
| Seafood speciality | boolean | Optional | | — | `seafood_speciality_flag` |
| Rating source and score | text + number | Optional | | 0–5 | `rating_source`, `rating_score` |
| Seating capacity | number | Optional | | ≥1 | `seating_capacity` |
| Reservations required | boolean | Optional | | — | `reservations_required` |
| Delivery available | boolean | Optional | | — | `delivery_available` |
| Caters for events | boolean + max capacity | Optional | | — | `caters_for_events`, `catering_max_capacity` |
| Accessibility | boolean | Optional | | — | `accessible` |
| Parking | boolean | Optional | | — | `parking_available` |
| Proximity fields | address (auto-derives distances) | Required | | — | `lat`, `lon`, `distance_to_tourist_area_km` |

### 4.6 Conference and Events Venue

| Field label | Type | Req? | Help text | Validation | Maps to |
|---|---|---|---|---|---|
| Venue type | select | Required | | — | notes/category field |
| Max capacity by layout | 5 number fields (theatre, classroom, banquet, cocktail, outdoor) | Required | | each ≥0 | `tourism_accommodations.conference_*` or a standalone row if not hotel-attached |
| Number of rooms | number | Required | | ≥1 | `conference_breakout_rooms` |
| AV equipment detail | rich_text | Required | | — | `conference_av_standard` |
| In-house catering | boolean | Required | | — | `conference_catering_inhouse` |
| External catering permitted | boolean | Optional | | — | notes |
| Accommodation on-site or nearby | boolean + distance | Optional | | — | notes |
| Parking capacity | number | Optional | | ≥0 | notes |
| Accessibility | multi-select | Optional | | — | notes |
| Natural light | boolean | Optional | | — | notes |
| Breakout spaces | number | Optional | | — | `conference_breakout_rooms` |
| Branding options | rich_text | Optional | | — | notes |
| Technical support on-site | boolean | Optional | | — | notes |
| Pricing structure | 3 number fields (full day, half day, per head) + currency | Required | | — | notes |
| Largest event hosted | text | Optional | | — | notes |

### 4.7 Local Guide and Interpreter Service

| Field label | Type | Req? | Help text | Validation | Maps to |
|---|---|---|---|---|---|
| Guide specialisations | multi-select | Required | cultural / nature / interpreter / marine biology / birdwatching / archaeology / history | — | notes/category |
| Languages spoken and interpreted | multi-select | Required | | ≥1 | `tourism_providers.languages_spoken` |
| Certification/accreditation held | text + file upload | Optional | | — | `tourism_providers.certifications_held` |
| Maximum group size | number | Required | | ≥1 | `group_size_max` |
| Day rate / half-day rate | number pair + currency | Required | | — | `price_min/max` |
| Custom itinerary service | boolean | Optional | | — | notes |
| Vehicle provided | boolean | Optional | | — | notes |
| Accessibility accommodation | rich_text | Optional | | — | notes |
| Years of experience | number | Optional | | ≥0 | `tourism_providers.years_operating` |
| Notable tours or clients | text | Optional, discreet | | — | notes |
| First aid certification held | boolean + file upload | Required | | — | `tourism_providers.certifications_held` |

### 4.8 Registration and Verification Section (all seven forms, appended identically)

**Registration fee**
- $10 USD equivalent, payable via: **(A)** USDC on Algorand through the PDC x402 adapter, or **(B)** Stripe card payment.
- Payment confirmation (webhook from either path) sets `tourism_providers.registration_fee_paid = true`, records `registration_fee_payment_method` and `registration_fee_tx_ref`, and **triggers the endpoint-creation workflow** below.

**Endpoint creation workflow**
1. Form submitted + payment confirmed → structured JSON payload sent to the Claude API.
2. Claude API formats the submission into a PDC endpoint record matching the relevant Part 2 table's schema (P9: Claude's output is validated against a strict JSON schema before use — no raw LLM text is written to a live table).
3. New row created with `source_type = 'provider_self_listed'`, `is_active = false` on the content table, and a `tourism_providers` row with `verification_status = 'pending'`.
4. SBP notified (Registry Operations Team, Decision 62) for human spot-check: business-name web search, website/social-media presence confirmed, location verified against a map, duplicate-listing check.
5. **Approved:** `verification_status = 'verified'`, content-table row `is_active = true`, endpoint registered on GoPlausible Bazaar, provider notified by email (Resend).
6. **Rejected:** `verification_status = 'rejected'`, `rejection_reason` populated, resubmission permitted after correction.

**NFT stub fields on registration (every form, identical copy)**
- "Would you like to offer an NFT discount to verified visitors?" (boolean, default false) — *"Feature coming soon as part of the TipTide wallet integration — not yet active. Toggling this on just registers your interest."*
- "Do you offer a local resident rate?" (boolean)
- "Local resident rate details" (text, optional)

---

## PART 5 — DATA GAP ANALYSIS

| Nation | Good public coverage | Partial coverage | No public data (provider-listing only) | Data-sharing agreement likely needed | SBP outreach priority |
|---|---|---|---|---|---|
| Fiji | Destination profile, gaming law, weddings, dive sites, Survivor history, UNESCO, drone rules | Air connectivity (fares), accommodation chain list | Inter-island ferry schedules/pricing, conference venues, accessibility | SPTO (bulk arrivals data), Tourism Fiji (operator directory) | **High** — highest tourism volume in scope, best existing coverage to build on first |
| Samoa | Destination profile, gaming law, alcohol/Sunday law, drone rules, Survivor history | Accommodation (limited chain presence to verify) | Inter-island ferry pricing, weddings (unverified), conference venues, accessibility | Samoa Tourism Authority | **High** — home jurisdiction, SBP's own base of operations |
| Tonga | Destination profile, gaming law (illegal), whale-swim signature activity | Air connectivity | Weddings, accommodation detail, accessibility, inter-island ferry pricing | Tonga Tourism | Medium-high |
| Vanuatu | Destination profile, gaming law, volcanic hazard (live), UNESCO, drone rules, Survivor history | Ferry operators (named class, unverified schedule) | Weddings, accessibility, conference venues | Vanuatu Tourism Office | Medium-high |
| Cook Islands | Weddings (verified), drone rules | Accommodation (no-chain norm), air connectivity | Inter-island ferry (minimal, mostly air-served), accessibility | Cook Islands Tourism | Medium |
| PNG | Gaming law, malaria risk, crocodile risk, destination events (Goroka/Hiri Moale already seeded) | Air connectivity, UNESCO (Kuk site, unverified) | Inter-island/domestic transport pricing, weddings, accommodation detail, accessibility, visa specifics (⚠️ actively variable) | PNG Tourism Promotion Authority — **essential**, PNG's data landscape is the most fragmented in scope | **High**, but expect the slowest return — PNG's tourism-data infrastructure is genuinely thin |
| Solomon Islands | Crocodile risk, decompression-chamber status (critical finding — chamber non-operational) | Gaming (unknown), air connectivity | Ferry/transport, accommodation, weddings, accessibility, conference venues, markets | Tourism Solomons | **High priority specifically for the health/safety tables** — the chamber finding alone justifies direct outreach to confirm current status before any dive endpoint goes live |
| Palau | Visa/entry (Palau Pledge, Green Fee — verified), UNESCO, gaming law | Chain accommodation (lower confidence) | Weddings, inter-island transport, accessibility, conference venues, drone rules | Palau Visitors Authority | Medium |
| French Polynesia | Visa/entry | Gaming (low confidence), air connectivity | Weddings, accessibility, drone rules, inter-island ferry pricing (ferries exist/are well-used but not independently priced this session) | Tahiti Tourisme | Medium — high-value destination but outside SBP's immediate Pacific-SIDS focus (French territory, different regulatory track) |
| Marshall Islands | UNESCO (Bikini Atoll), visa | — | **Almost everything else** — accommodation, transport, F&B, accessibility, weddings, markets, conference venues | Visit Marshall Islands (if it has capacity to engage) | Low-medium — very low current tourism volume means provider self-listing may never populate meaningfully without a direct SBP-led outreach/onboarding push |
| FSM | Visa, dive-site reputation (Chuuk Lagoon) | — | Almost everything outside the dive-tourism niche | FSM national tourism office | Low-medium — the Chuuk Lagoon dive niche is worth prioritising even if the rest of the nation's tourism data stays thin |
| Kiribati | UNESCO (Phoenix Islands), visa, Kiritimati niche (flats fishing — not independently verified this session) | — | Almost everything — Kiribati's own inter-island logistics problem (§1.4) means even basic transport data is thin | Kiribati Tourism | Low — smallest realistic near-term volume in scope |
| Niue | Visa/Realm status, population context | — | Almost everything — single-carrier air access is itself the dominant fact about Niue's tourism accessibility | Niue Tourism | Low — but a uniquely clean "small island, one dive/eco-tourism niche, high per-provider value" profile that may suit a boutique provider-onboarding push even without broad curated coverage |

### Legally ambiguous scraping targets — explicit flag

- **TripAdvisor** — do not scrape or bulk-ingest. Reviews/ratings/place data on TripAdvisor are generally subject to terms restricting caching, re-display, and resale, which conflicts directly with reselling that data through an x402-gated endpoint.
- **Google Places API** — same posture. The API's terms generally restrict storing results beyond a short cache window and prohibit using the data to build a competing place-directory product — which is functionally what this framework is. **Recommended clean alternative for both:** provider self-declared ratings (already the brief's own Decision 28 Silver-tier mechanism) plus PDC's own Bronze/Silver/Gold trust signal, never a scraped third-party star rating.
- **PADI/SSI/NAUI "find a dive center" directories** — these are each body's own commercial listing product for their member shops; PDC has no licence to bulk-republish them. **Clean alternative:** the dive operator self-declares their certification body and level at registration (§4.3); PDC does not independently scrape the certifying body's locator.
- **National tourism authority websites generally** — no explicit ToS violation identified, but most have no published data-reuse licence at all. Manual curation with an explicit `data_source` + `last_verified` citation (as designed throughout Part 2) is the correct posture — not automated scraping at volume, and not a claim of real-time freshness the source itself doesn't support.
- **DFAT/FCDO/State Dept/NZ SafeTravel advisory pages** — not confirmed as prohibited, but their HTML is deliberately rendering-heavy (scrape-resistant) and advisory content is sensitive enough that an automated-scraper approach should be reviewed against each site's specific terms before building, not assumed clear by default. See §1.19's recommended "linked, not claimed" design as the safer default regardless.

### Priority order for SBP outreach (synthesis)

1. **Fiji and Samoa** — best existing data, highest tourism volume, home-jurisdiction relationship advantage for Samoa specifically.
2. **Solomon Islands** — not for volume, but because the decompression-chamber finding (§1.12) is safety-critical and must be confirmed directly with Tourism Solomons / the Honiara hospital before any dive-planning agent is allowed to rely on PDC data for that nation.
3. **Vanuatu, Tonga, Cook Islands, PNG** — second-tier volume, meaningful existing public-source coverage to build from.
4. **Palau, French Polynesia, FSM** — dive-tourism-niche value justifies targeted (not comprehensive) outreach focused specifically on their signature dive assets (Rock Islands, Bora Bora lagoon, Chuuk Lagoon).
5. **Marshall Islands, Kiribati, Niue** — lowest near-term priority on a pure-volume basis; realistic path is a boutique, SBP-initiated provider-onboarding push rather than broad curated research, given how little public tourism-data infrastructure exists for any of the three.

---

*End of report. All ✅-marked facts were confirmed via live web search on 2026-10-26 and are cited inline; all other facts are flagged by confidence level per the key in §0. Re-verify ⚠️-flagged volatile facts (gaming-law proposals, volcanic alert levels, travel advisories, airline operational status) immediately before any publish, not at build time.*
