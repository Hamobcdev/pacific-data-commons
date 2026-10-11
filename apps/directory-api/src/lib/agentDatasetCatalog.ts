import { paidRoutes } from "../routeSchemas.js";

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
 * Scoped to the five data-bearing categories (finance/climate/fisheries/
 * intelligence/tourism) — the directory meta-routes (/search, /provider/:id,
 * /endpoint/:id, /verify/:certHash) and /algorand/wallet-balance are
 * discovery/utility routes, not registry datasets, and are left out.
 */

export interface AgentDatasetMetadata {
  category: "finance" | "climate" | "fisheries" | "intelligence" | "tourism";
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
};

/** Datasets wired into POST /api/v1/datasets/:id/query's adapter — MVP scope is samoa-cpi only (CLAUDE.md Stream A recommended first slice). Every other dataset is listed for discovery but returns 501 from the query adapter until wired. */
const QUERYABLE_DATASET_IDS = new Set(["samoa-cpi"]);

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
