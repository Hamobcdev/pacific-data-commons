import { paidRoutes } from "../routeSchemas.js";
import { type DataCategory } from "./dataCategories.js";

/**
 * Stream A — Agent Dataset Gateway (CLAUDE.md Decision 61, "PDC as Pacific
 * Data Registry"). This is the catalog backing GET /api/v1/datasets and
 * GET /api/v1/manifests/:id.
 *
 * Deliberately NOT a third hand-maintained copy of the endpoint list that
 * already exists twice (routes/discovery.ts's /.well-known/x402-directory.json
 * and routes/wellKnownX402.ts's /.well-known/x402, both free agent-discovery
 * manifests aimed at generic x402 crawlers). This catalog is derived from
 * routeSchemas.ts's `paidRoutes` — the actual pricing/discovery source of
 * truth already consumed by app.ts's paymentGate.addRoute() loop and by
 * routeSchemas.test.ts — so a route's price or discovery schema can never
 * drift out of sync with what this catalog reports. Only the fields
 * `paidRoutes` doesn't carry (category, data_currency, upstream_source,
 * reporting_lag_note — the per-response fields Decision 61 requires) are
 * supplied here, sourced from docs/current-state/agent-dataset-inventory.csv.
 *
 * Scoped to the six data-bearing categories (finance/climate/fisheries/
 * intelligence/tourism/algorand) — the directory meta-routes (/search,
 * /provider/:id, /endpoint/:id, /verify/:certHash) are discovery/utility
 * routes, not registry datasets, and are left out. /algorand/wallet-balance
 * IS a registry dataset here (Session 3) — it's a genuine first-party
 * data lookup (Decision 59), not a directory meta-route.
 */

export interface AgentDatasetMetadata {
  // "demographics" added for /demographics/pacific-population — the first
  // dataset under that path prefix. lib/dataCategories.ts's DATA_CATEGORIES
  // already had "demographics" as a valid category; nothing here used it
  // before this one.
  category: "finance" | "climate" | "fisheries" | "intelligence" | "tourism" | "algorand" | "demographics";
  dataCurrency: string;
  upstreamSource: string;
  reportingLagNote?: string;
}

const DATASET_METADATA: Record<string, AgentDatasetMetadata> = {
  "/finance/fx": { category: "finance", dataCurrency: "daily", upstreamSource: "fawazahmed0/currency-api (jsDelivr)" },
  "/finance/samoa-cpi": { category: "finance", dataCurrency: "annual", upstreamSource: "World Bank Open Data (FP.CPI.TOTL)" },
  "/finance/samoa-gdp": { category: "finance", dataCurrency: "annual", upstreamSource: "Samoa Bureau of Statistics (FY2025/26 report)" },
  "/finance/fiji-gdp": { category: "finance", dataCurrency: "annual", upstreamSource: "Fiji Bureau of Statistics (FBoS Release No. 62)" },
  "/finance/fiji-cpi": { category: "finance", dataCurrency: "monthly", upstreamSource: "Fiji Bureau of Statistics (monthly CPI press releases)" },
  "/finance/crypto-rates": { category: "finance", dataCurrency: "real-time", upstreamSource: "CoinGecko public API" },
  "/finance/crypto-history": { category: "finance", dataCurrency: "real-time (5-min buffer)", upstreamSource: "Binance (primary) / CoinCap (fallback) via KV Cron Trigger" },
  "/finance/arbitrage-signals": { category: "finance", dataCurrency: "real-time", upstreamSource: "GeckoTerminal + Tinyman + Pact" },
  "/finance/remittance-corridors": {
    category: "finance",
    dataCurrency: "quarterly (static fallback Q4-2024)",
    upstreamSource: "World Bank RPW + /finance/fx (internal)",
    reportingLagNote: "World Bank Remittance Prices Worldwide updates quarterly; the most recent available quarter may lag the calendar quarter by several months.",
  },
  "/climate/ocean-temperature": { category: "climate", dataCurrency: "3-hourly", upstreamSource: "Open-Meteo Marine Weather API" },
  "/climate/pacific-ocean-temp": { category: "climate", dataCurrency: "real-time (~6-min)", upstreamSource: "NOAA CO-OPS Tides & Currents API" },
  "/climate/pacific-ocean-forecast": { category: "climate", dataCurrency: "daily-forecast", upstreamSource: "HYCOM GLBy0.08 via Pacific Data Hub THREDDS" },
  "/climate/pacific-coral-bleaching": { category: "climate", dataCurrency: "daily", upstreamSource: "NOAA Coral Reef Watch CoralTemp 5km (ERDDAP)" },
  "/climate/pacific-cyclone-history": { category: "climate", dataCurrency: "historical (1960-present)", upstreamSource: "IBTrACS v04r01 (NOAA/NCEI) — static bundle" },
  "/climate/pacific-sea-level": {
    category: "climate",
    dataCurrency: "monthly (through Jul 2026 preliminary)",
    upstreamSource: "UHSLC Fast Delivery + Research Quality data",
    reportingLagNote: "Research Quality data lags Fast Delivery data by up to several months; the most recent months served may be preliminary Fast Delivery values.",
  },
  "/climate/pacific-enso-index": { category: "climate", dataCurrency: "bimonthly (1979-present)", upstreamSource: "NOAA PSL MEI.v2 — static bundle" },
  "/fisheries/pacific-purse-seine": {
    category: "fisheries",
    dataCurrency: "historical (1967-2021)",
    upstreamSource: "WCPFC Public Domain 1x1 via Pacific Data Hub THREDDS",
    reportingLagNote: "WCPFC's public-domain catch data is typically released 1-2 years after the catch year.",
  },
  "/intelligence/pacific-brief": { category: "intelligence", dataCurrency: "real-time (sub-endpoint composite)", upstreamSource: "PDC sub-endpoints (fisheries + /finance/fx + /algorand/wallet-balance) + Claude synthesis" },
  "/intelligence/pacific-travel": { category: "intelligence", dataCurrency: "real-time (sub-endpoint composite)", upstreamSource: "PDC sub-endpoints (events + fx + fisheries + weather + tourism-stats) + Claude synthesis" },
  "/pacific/events": { category: "tourism", dataCurrency: "on-demand", upstreamSource: "SPTO + tourism authorities" },
  "/pacific/weather": { category: "tourism", dataCurrency: "hourly", upstreamSource: "Open-Meteo (ECMWF model)" },
  "/algorand/wallet-balance": { category: "algorand", dataCurrency: "real-time", upstreamSource: "Nodely (primary) / AlgoNode (fallback)" },
  "/finance/pacific-gdp": { category: "finance", dataCurrency: "annual", upstreamSource: "World Bank Open Data (NY.GDP.MKTP.CD)" },
  "/demographics/pacific-population": { category: "demographics", dataCurrency: "annual", upstreamSource: "World Bank Open Data (SP.POP.TOTL)" },
  "/finance/pacific-cpi": { category: "finance", dataCurrency: "annual", upstreamSource: "Pacific Community (SPC) SDMX data service (DF_CPI)" },
  "/invest/pacific-setup-comparison": { category: "investment", dataCurrency: "October 2026", upstreamSource: "SBP synthesis: MCIL Samoa, Investment Fiji, VFIPA Vanuatu, IPA PNG, MFEM Tonga, MCITP Solomon Islands" },
  "/invest/pacific-tax-comparison": { category: "investment", dataCurrency: "October 2026", upstreamSource: "SBP synthesis: Samoa VAGST Act, FRCA Fiji, Vanuatu VFIPA, IRC PNG, Tonga MoR, Solomon Islands IRD" },
  "/invest/pacific-land-tenure": { category: "investment", dataCurrency: "October 2026", upstreamSource: "SBP synthesis: Samoa Land Corporation, iTaukei Land Trust Board Fiji, Vanuatu Custom Land Act, PNG Land Act, Tonga Land Act, Solomon Islands Land & Titles Act" },
  "/invest/pacific-sector-restrictions": { category: "investment", dataCurrency: "October 2026", upstreamSource: "SBP synthesis: national investment authority reserved activities lists — MCIL Samoa, Investment Fiji, VFIPA Vanuatu, IPA PNG, MFEM Tonga, MCITP Solomon Islands" },
  "/invest/pacific-regulatory-scores": { category: "investment", dataCurrency: "October 2026", upstreamSource: "SBP proprietary 6-dimension regulatory scoring model — all 6 Pacific nation investment authority sources" },
  "/invest/pacific-setup-checklist": { category: "investment", dataCurrency: "October 2026", upstreamSource: "SBP synthesis: per-nation step-by-step from national registrar, tax authority, investment authority, and sector regulators" },
};

/**
 * Datasets wired into POST /api/v1/datasets/:id/query's adapter. Must
 * stay in sync with the switch cases in routes/agentDatasetGateway.ts's
 * runDatasetQuery(). Session 3 wires every dataset in DATASET_METADATA
 * above — this set should always equal its keys' derived ids (see the
 * routeRegistration-style completeness assertion in
 * __tests__/agentDatasetGateway.test.ts), but stays an explicit list
 * rather than derived from DATASET_METADATA directly so a newly added
 * catalog entry that isn't yet wired fails safe (501) instead of being
 * silently treated as queryable.
 */
const QUERYABLE_DATASET_IDS = new Set([
  "samoa-cpi",
  "samoa-gdp",
  "fiji-gdp",
  "fiji-cpi",
  "fx",
  "crypto-rates",
  "crypto-history",
  "arbitrage-signals",
  "remittance-corridors",
  "ocean-temperature",
  "pacific-ocean-temp",
  "pacific-ocean-forecast",
  "pacific-coral-bleaching",
  "pacific-cyclone-history",
  "pacific-sea-level",
  "pacific-enso-index",
  "pacific-purse-seine",
  "pacific-brief",
  "pacific-travel",
  "events",
  "weather",
  "wallet-balance",
  "pacific-gdp",
  "pacific-population",
  "pacific-cpi",
  "pacific-setup-comparison",
  "pacific-tax-comparison",
  "pacific-land-tenure",
  "pacific-sector-restrictions",
  "pacific-regulatory-scores",
  "pacific-setup-checklist",
]);

export interface AgentDataset {
  datasetId: string;
  path: string;
  method: string;
  description: string;
  priceUsdc: number;
  payToWallet?: string;
  category: AgentDatasetMetadata["category"];
  dataCurrency: string;
  upstreamSource: string;
  reportingLagNote?: string;
  queryable: boolean;
  manifestEndpoint: string;
  queryEndpoint: string | null;
}

function datasetIdFromPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) throw new Error(`cannot derive dataset id from path "${path}"`);
  return last;
}

function buildCatalog(): AgentDataset[] {
  const catalog: AgentDataset[] = [];

  for (const route of paidRoutes) {
    const metadata = DATASET_METADATA[route.path];
    if (!metadata) continue; // not a registry dataset (directory/utility route) — excluded by design, see file doc comment

    const datasetId = datasetIdFromPath(route.path);

    catalog.push({
      datasetId,
      path: route.path,
      method: route.method,
      description: route.description,
      priceUsdc: route.priceUsdc ?? 0.01,
      payToWallet: route.payToAddress,
      category: metadata.category,
      dataCurrency: metadata.dataCurrency,
      upstreamSource: metadata.upstreamSource,
      reportingLagNote: metadata.reportingLagNote,
      queryable: QUERYABLE_DATASET_IDS.has(datasetId),
      manifestEndpoint: `/api/v1/manifests/${datasetId}`,
      queryEndpoint: QUERYABLE_DATASET_IDS.has(datasetId) ? `/api/v1/datasets/${datasetId}/query` : null,
    });
  }

  return catalog;
}

export const AGENT_DATASET_CATALOG: AgentDataset[] = buildCatalog();

export function getAgentDataset(datasetId: string): AgentDataset | undefined {
  return AGENT_DATASET_CATALOG.find((d) => d.datasetId === datasetId);
}

/**
 * Maps this catalog's own category taxonomy onto lib/dataCategories.ts's
 * canonical DataCategory enum — used by routes/discovery.ts and
 * routes/wellKnownX402.ts's agent-discovery manifests, which advertise
 * DATA_CATEGORIES as their category vocabulary. "intelligence" and
 * "algorand" have no direct DataCategory equivalent (composite synthesis
 * briefs and a wallet lookup aren't research papers or financial flows)
 * so both map to "other" rather than overloading an unrelated category.
 */
const CATEGORY_TO_DATA_CATEGORY: Record<AgentDatasetMetadata["category"], DataCategory> = {
  finance: "financial_flows",
  climate: "climate",
  fisheries: "fisheries",
  tourism: "tourism",
  intelligence: "other",
  algorand: "other",
  demographics: "demographics",
};

export function catalogCategoryToDataCategory(category: AgentDatasetMetadata["category"]): DataCategory {
  return CATEGORY_TO_DATA_CATEGORY[category];
}
