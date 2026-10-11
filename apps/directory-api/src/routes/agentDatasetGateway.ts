import { Hono } from "hono";
import { AGENT_DATASET_CATALOG, getAgentDataset } from "../lib/agentDatasetCatalog.js";
import { requireKnownAgentWallet } from "../middleware/agentWalletAuth.js";
import { getSamoaCpi, parseYearsParam } from "../services/samoaCpiService.js";
import { NotFoundError, NotImplementedError } from "../lib/errors.js";
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
 *                                         MVP scope: samoa-cpi only, every
 *                                         other dataset returns 501.
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
          body_schema: { params: { years: "integer, optional, 1-60, default 15" } },
        }
      : null,
    not_yet_wired_note: dataset.queryable ? null : `Not yet wired into the gateway's query adapter — query it directly at ${dataset.method} ${dataset.path} instead.`,
  });
});

agentDatasetGatewayRoute.post("/api/v1/datasets/:id/query", requireKnownAgentWallet, async (c) => {
  const datasetId = c.req.param("id");
  const dataset = getAgentDataset(datasetId);
  if (!dataset) {
    throw new NotFoundError(`No dataset for id "${datasetId}"`);
  }

  if (datasetId !== "samoa-cpi") {
    throw new NotImplementedError(
      `Dataset "${datasetId}" is listed in the catalog but not yet wired into the query adapter — query it directly at ${dataset.method} ${dataset.path} instead.`,
    );
  }

  const body: unknown = await c.req.json().catch(() => undefined);
  const params = (body as { params?: { years?: number | string } } | undefined)?.params;
  const years = parseYearsParam(params?.years);

  const result = await getSamoaCpi(years);

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
