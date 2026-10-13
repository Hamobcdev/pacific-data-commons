// worldBankPacificPopulationService.ts
//
// World Bank total population for 6 Pacific Island nations — Fiji, Papua
// New Guinea, Solomon Islands, Tonga, Vanuatu, Samoa — sourced from World
// Bank Open Data's free public API, no key required. Decision 59/60:
// first-party wrapper over an already-openly-accessible aggregator API,
// Tier 1 capped. Same World Bank Open Data API family as
// worldBankPacificGdpService.ts; this is the population variant (indicator
// SP.POP.TOTL), confirmed live 2026-10-13 — real values returned for all 6
// nations, current through 2025.
//
// candidate_domains on this source's pdqe.sources row is OTHER, not a
// DEMOGRAPHICS value — pdqe.source_domain has no such enum value
// (confirmed live 2026-10-13). The discovery-layer category below
// ("demographics") is a different, already-existing enum
// (lib/dataCategories.ts's DATA_CATEGORIES) that does have one.
//
// pdqe.sources row: d4bd8248-bb76-4476-9f1b-3de40dd7e594 (World Bank
// Population — Pacific Island Nations), registered 2026-10-13.

import { ValidationError } from "../lib/errors.js";

const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — annual data

const COUNTRIES = ["WSM", "FJI", "TON", "VUT", "SLB", "PNG"] as const;
const INDICATOR = "SP.POP.TOTL";
const WORLD_BANK_URL = `https://api.worldbank.org/v2/country/${COUNTRIES.join(";")}/indicator/${INDICATOR}`;

export const SOURCE_ATTRIBUTION = {
  source: "World Bank Open Data",
  source_url: WORLD_BANK_URL,
  original_source: "National statistics offices of each listed country, as compiled by the World Bank",
  data_quality: "third_party_aggregated" as const,
  disclaimer:
    "This endpoint serves World Bank Open Data's own published population series via PDC's structured queryable layer. World Bank compiles this from each country's national statistics office; SBP has not independently confirmed these figures. Do not present this as a primary-source or government-certified statistic.",
};

interface WorldBankObservation {
  date: string;
  value: number | null;
  countryiso3code: string;
  country: { id: string; value: string };
}

interface WorldBankResponse {
  0: { page: number; pages: number; per_page: number; total: number; lastupdated?: string };
  1: WorldBankObservation[] | null;
}

export interface PopulationObservation {
  country_iso3: string;
  country_name: string;
  year: number;
  population_total: number | null;
}

export interface PopulationResult {
  countries: readonly string[];
  observations: PopulationObservation[];
  latest_by_country: Record<string, PopulationObservation | null>;
  world_bank_last_updated: string | null;
  fetched_at: string;
  attribution: typeof SOURCE_ATTRIBUTION;
}

let cache: { data: PopulationResult; expires: number } | null = null;

async function fetchFreshPopulation(years: number): Promise<PopulationResult> {
  const url = `${WORLD_BANK_URL}?format=json&per_page=500&mrv=${years}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`World Bank API (Population) returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as WorldBankResponse;
  const raw = data[1] ?? [];
  if (raw.length === 0) {
    throw new Error("World Bank API (Population) returned no observations for the Pacific country set");
  }

  const observations: PopulationObservation[] = raw
    .map((obs) => ({
      country_iso3: obs.countryiso3code,
      country_name: obs.country.value,
      year: Number(obs.date),
      population_total: obs.value,
    }))
    .sort((a, b) => a.country_name.localeCompare(b.country_name) || b.year - a.year);

  const latest_by_country: Record<string, PopulationObservation | null> = {};
  for (const iso3 of COUNTRIES) {
    latest_by_country[iso3] = observations.find((o) => o.country_iso3 === iso3 && o.population_total !== null) ?? null;
  }

  return {
    countries: COUNTRIES,
    observations,
    latest_by_country,
    world_bank_last_updated: data[0]?.lastupdated ?? null,
    fetched_at: new Date().toISOString(),
    attribution: SOURCE_ATTRIBUTION,
  };
}

/** years: how many most-recent values per country to return (World Bank's own mrv param). Default 10. */
export function parseYearsParam(raw: string | number | undefined): number {
  if (raw === undefined) return 10;
  const years = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(years) || years < 1 || years > 60) {
    throw new ValidationError("years must be an integer between 1 and 60");
  }
  return years;
}

export async function getPacificPopulation(years = 10): Promise<PopulationResult> {
  if (!cache || Date.now() >= cache.expires) {
    try {
      const fresh = await fetchFreshPopulation(years);
      cache = { data: fresh, expires: Date.now() + CACHE_TTL_MS };
    } catch (err) {
      if (cache) {
        return cache.data;
      }
      throw err;
    }
  }
  return cache.data;
}

/** Test-only: clears the in-memory cache between test cases. */
export function __resetPacificPopulationCacheForTests(): void {
  cache = null;
}
