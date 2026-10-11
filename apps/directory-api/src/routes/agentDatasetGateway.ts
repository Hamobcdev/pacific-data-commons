import { Hono } from "hono";
import { AGENT_DATASET_CATALOG, getAgentDataset } from "../lib/agentDatasetCatalog.js";
import { requireKnownAgentWallet } from "../middleware/agentWalletAuth.js";
import { getSamoaCpi, parseYearsParam } from "../services/samoaCpiService.js";
import { querySeaLevel } from "../services/pacificSeaLevelService.js";
import { getPurseSeineCatch, parsePurseSeineParams } from "../services/pacificFisheriesPurseSeineService.js";
import { getPacificOceanForecast } from "../services/pacificOceanForecastService.js";
import { AppError, NotFoundError, NotImplementedError } from "../lib/errors.js";
import type { AgentDataset } from "../lib/agentDatasetCatalog.js";
import type { AppBindings } from "../types.js";

/**
 * Stream A — Agent Dataset Gateway (CLAUDE.md Decision 61 / "PDC as Pacific
 * Data Registry"). Three routes, same single-file-per-feature convention
 * as routes/psr.ts:
 *
 *   GET  /api/v1/datasets              — free catalog (lib/agentDatasetCatalog.ts)
 *   GET  /api/v1/manifests/:id         — free per-dataset manifest + provenance
 *   POST /api/v1/datasets/:id/query    — paid (routeSchemas.ts paidRoutes),
 *                                         gated by requireKnownAgentWallet.
 *                                         Each wired dataset calls its
 *                                         direct-route's service function
 *                                         in-process (no second HTTP
 *                                         round-trip, no double charge) —
 *                                         see runDatasetQuery() below. Every
 *                                         other cataloged dataset returns
 *                                         501 until wired.
 */
export const agentDatasetGatewayRoute = new Hono<AppBindings>();

agentDatasetGatewayRoute.get("/api/v1/datasets", (c) => {
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    schema_version: "pdc-agent-gateway-1.0",
    generated_at: new Date().toISOString(),
    datasets: AGENT_DATASET_CATALOG.map((d) => ({
      dataset_id: d.datasetId,
      category: d.category,
      description: d.description,
      price_usdc: d.priceUsdc,
      data_currency: d.dataCurrency,
      upstream_source: d.upstreamSource,
      reporting_lag_note: d.reportingLagNote ?? null,
      queryable: d.queryable,
      manifest_endpoint: d.manifestEndpoint,
      query_endpoint: d.queryEndpoint,
    })),
  });
});

/** Per-dataset POST body `params` shape, surfaced in GET /api/v1/manifests/:id's query_requirements for every queryable dataset. Must stay in sync with runDatasetQuery()'s switch cases below. */
const QUERY_PARAM_SCHEMAS: Record<string, Record<string, string>> = {
  "samoa-cpi": {
    years: "integer, optional, 1-60, default 15",
  },
  "pacific-sea-level": {
    station: "string, optional — station name substring, e.g. Funafuti",
    nation: "string, optional — ISO-2 code: WS, FJ, TO, VU, SB, KI, TV, PG",
    from: "string, optional — YYYY-MM, inclusive",
    to: "string, optional — YYYY-MM, inclusive",
  },
  "pacific-purse-seine": {
    species: "string, optional — one of skj, yft, bet, default skj (albacore is not available from this dataset)",
    year: "integer, required — 4-digit year, 1967-2021",
  },
  "pacific-ocean-forecast": {},
};

agentDatasetGatewayRoute.get("/api/v1/manifests/:id", (c) => {
  const dataset = getAgentDataset(c.req.param("id"));
  if (!dataset) {
    throw new NotFoundError(`No dataset manifest for id "${c.req.param("id")}"`);
  }

  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    schema_version: "pdc-agent-gateway-1.0",
    dataset_id: dataset.datasetId,
    category: dataset.category,
    description: dataset.description,
    direct_path: dataset.path,
    direct_method: dataset.method,
    price_usdc: dataset.priceUsdc,
    pay_to_wallet: dataset.payToWallet ?? null,
    provenance: {
      data_currency: dataset.dataCurrency,
      upstream_source: dataset.upstreamSource,
      reporting_lag_note: dataset.reportingLagNote ?? null,
    },
    queryable: dataset.queryable,
    query_endpoint: dataset.queryEndpoint,
    query_requirements: dataset.queryable
      ? {
          headers: { "X-Agent-Wallet": "Algorand address registered in the agents table" },
          body_schema: { params: QUERY_PARAM_SCHEMAS[dataset.datasetId] ?? {} },
        }
      : null,
    not_yet_wired_note: dataset.queryable ? null : `Not yet wired into the gateway's query adapter — query it directly at ${dataset.method} ${dataset.path} instead.`,
  });
});

/**
 * Executes one dataset's query against its direct-route's service
 * function, in-process. Each case mirrors the validation and error
 * handling of that dataset's own GET route exactly (see
 * routes/finance/samoa-cpi.ts, routes/climate/pacificSeaLevel.ts,
 * routes/fisheries/pacific-purse-seine.ts, routes/climate/pacific-ocean-forecast.ts)
 * so the gateway can never silently diverge from the direct endpoint's
 * behaviour.
 */
async function runDatasetQuery(dataset: AgentDataset, params: Record<string, unknown> | undefined): Promise<unknown> {
  switch (dataset.datasetId) {
    case "samoa-cpi": {
      const years = parseYearsParam(params?.years as number | string | undefined);
      return getSamoaCpi(years);
    }

    case "pacific-sea-level": {
      return querySeaLevel({
        station: params?.station as string | undefined,
        nation: params?.nation as string | undefined,
        from: params?.from as string | undefined,
        to: params?.to as string | undefined,
      });
    }

    case "pacific-purse-seine": {
      const { species, year } = parsePurseSeineParams(params?.species as string | undefined, params?.year as string | number | undefined);
      const result = await getPurseSeineCatch(species, year);
      if (!result) {
        throw new AppError(503, "service_unavailable", "Purse seine catch data is temporarily unavailable. Try again shortly.");
      }
      return result;
    }

    case "pacific-ocean-forecast": {
      const result = await getPacificOceanForecast();
      if (!result) {
        throw new AppError(502, "bad_gateway", "Ocean forecast data is temporarily unavailable from the upstream THREDDS server. Try again shortly.");
      }
      return result;
    }

    default:
      throw new NotImplementedError(
        `Dataset "${dataset.datasetId}" is listed in the catalog but not yet wired into the query adapter — query it directly at ${dataset.method} ${dataset.path} instead.`,
      );
  }
}

agentDatasetGatewayRoute.post("/api/v1/datasets/:id/query", requireKnownAgentWallet, async (c) => {
  const datasetId = c.req.param("id");
  const dataset = getAgentDataset(datasetId);
  if (!dataset) {
    throw new NotFoundError(`No dataset for id "${datasetId}"`);
  }

  const body: unknown = await c.req.json().catch(() => undefined);
  const params = (body as { params?: Record<string, unknown> } | undefined)?.params;

  const result = await runDatasetQuery(dataset, params);

  return c.json({
    schema_version: "pdc-agent-gateway-1.0",
    dataset_id: datasetId,
    queried_at: new Date().toISOString(),
    agent_wallet: c.get("agentWallet"),
    provenance: {
      data_currency: dataset.dataCurrency,
      upstream_source: dataset.upstreamSource,
      reporting_lag_note: dataset.reportingLagNote ?? null,
    },
    result,
  });
});
