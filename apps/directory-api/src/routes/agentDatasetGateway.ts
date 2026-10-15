import { Hono, type Context } from "hono";
import { AGENT_DATASET_CATALOG, getAgentDataset } from "../lib/agentDatasetCatalog.js";
import { requireKnownAgentWallet } from "../middleware/agentWalletAuth.js";
import { getSamoaCpi, parseYearsParam } from "../services/samoaCpiService.js";
import { getSamoaGdp, parseSamoaGdpParams } from "../services/samoaGdpService.js";
import { getFijiGdp, parseFijiGdpParams } from "../services/fijiGdpService.js";
import { getFijiCpi, parseFijiCpiParams } from "../services/fijiCpiService.js";
import { queryFx } from "../services/fxRateService.js";
import { queryCryptoRates } from "../services/pacificCryptoRatesService.js";
import { queryCryptoHistory } from "../services/pacificCryptoHistoryService.js";
import { queryArbitrageSignals } from "../services/pacificDexArbitrageService.js";
import { queryRemittanceCorridors } from "../services/pacificRemittanceService.js";
import { getPacificOceanClimate, parseOceanTemperatureCountry } from "../services/pacificOceanClimateService.js";
import { getPacificWaterTemperature, DEFAULT_STATION, VALID_STATIONS, isValidStation } from "../services/pacificWaterTemperatureService.js";
import { querySeaLevel } from "../services/pacificSeaLevelService.js";
import { getPurseSeineCatch, parsePurseSeineParams } from "../services/pacificFisheriesPurseSeineService.js";
import { getPacificOceanForecast } from "../services/pacificOceanForecastService.js";
import { getCoralBleaching, parseCoralBleachingParams } from "../services/pacificCoralBleachingService.js";
import { queryCycloneHistory } from "../services/pacificCycloneHistoryService.js";
import { queryEnsoIndex } from "../services/pacificEnsoIndexService.js";
import { queryPacificBrief } from "../services/pacificIntelligenceService.js";
import { queryPacificTravelBrief } from "../services/pacificTourismService.js";
import { queryEvents } from "../services/pacificEventsService.js";
import { getPacificWeather, parseWeatherCountry } from "../services/pacificWeatherService.js";
import { getAlgorandWalletBalance, isValidAlgorandAddress } from "../services/algorandBalanceService.js";
import { getPacificGdp, parseYearsParam as parsePacificGdpYearsParam } from "../services/worldBankPacificGdpService.js";
import { getPacificPopulation, parseYearsParam as parsePacificPopulationYearsParam } from "../services/worldBankPacificPopulationService.js";
import { getPacificCpi } from "../services/spcPacificCpiService.js";
import {
  getEntitySetup,
  getComplianceStatus,
  getServiceProviders,
  getBankingSetup,
  parseEntityType,
} from "../services/samoaSifaService.js";
import {
  getSetupComparison,
  getTaxComparison,
  getLandTenureComparison,
  getSectorRestrictions,
  getRegulatoryScores,
  getSetupChecklist,
  ALL_NATION_CODES,
  type NationCode,
} from "../services/pacificInvestmentService.js";
import { AppError, NotFoundError, NotImplementedError, ValidationError } from "../lib/errors.js";
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
 *                                         Every cataloged dataset (Session 3)
 *                                         calls its direct-route's shared
 *                                         service function in-process — no
 *                                         second HTTP round-trip, no double
 *                                         charge. See runDatasetQuery() below.
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
  "samoa-cpi": { years: "integer, optional, 1-60, default 15" },
  "samoa-gdp": { fiscal_year: "string, optional, e.g. FY2025/26", all: "boolean, optional, default false" },
  "fiji-gdp": { year: "string, required, e.g. 2019", measure: "string, optional — nominal|real_growth, default nominal" },
  "fiji-cpi": { year: "integer, optional, 4-digit", from: "string, optional, YYYY-MM", to: "string, optional, YYYY-MM" },
  fx: {
    from: "string, optional — conversion source currency, required together with to and amount",
    to: "string, optional — conversion target currency, required together with from and amount",
    amount: "number, optional — required together with from and to",
    base: "string, optional — re-base all rates to this currency instead of USD",
    pairs: "string, optional — comma-separated currency codes",
    pacific_only: "boolean, optional",
  },
  "crypto-rates": { category: "string, optional — defi|l1|l2|pacific", symbols: "string, optional — comma-separated, e.g. BTC,ETH,ALGO" },
  "crypto-history": { symbol: "string, required — one of ALGO, BTC, ETH, XRP, XLM, USDC, USDT", tf: "string, optional — 5m|15m|1h|4h|8h|1D|1W|1M, default 1D" },
  "arbitrage-signals": {
    pair: "string, optional — one of the curated pairs, e.g. ETH/USDC",
    chain: "string, optional — ethereum|arbitrum|bnb|polygon|algorand",
    min_spread_pct: "number, optional, default 0",
  },
  "remittance-corridors": {
    corridor: "string, optional — one corridor id, e.g. AUS_WST",
    token: "string, optional — one of XRP, XLM, ALGO",
    min_saving_pct: "number, optional, default 0",
  },
  "ocean-temperature": { country: "string, required — ISO 3166-1 alpha-2: WS, FJ, TO, PG, SB, VU, CK" },
  "pacific-ocean-temp": { station: "string, optional — NOAA station id, default 1770000" },
  "pacific-ocean-forecast": {},
  "pacific-coral-bleaching": {
    lat: "number, optional, -90..90, default -13.759",
    lon: "number, optional, -180..180, default -172.104",
    radius_deg: "number, optional, 0.1..10, default 2.0",
  },
  "pacific-cyclone-history": {
    season: "string, optional — 4-digit year",
    nation: "string, optional — ISO 2-letter code",
    min_category: "string, optional — td|c1|c2|c3|c4|c5",
    landfall: "boolean, optional",
    limit: "integer, optional, default 100, max 500",
  },
  "pacific-sea-level": {
    station: "string, optional — station name substring, e.g. Funafuti",
    nation: "string, optional — ISO-2 code: WS, FJ, TO, VU, SB, KI, TV, PG",
    from: "string, optional — YYYY-MM, inclusive",
    to: "string, optional — YYYY-MM, inclusive",
  },
  "pacific-enso-index": {
    year: "string, optional — 4-digit year",
    from: "string, optional — 4-digit start year",
    to: "string, optional — 4-digit end year",
    phase: "string, optional — elnino|lanina|neutral",
  },
  "pacific-purse-seine": {
    species: "string, optional — one of skj, yft, bet, default skj (albacore is not available from this dataset)",
    year: "integer, required — 4-digit year, 1967-2021",
  },
  "pacific-brief": { topic: "string, optional — fisheries|marine|ocean|economic|climate|general, default general", country: "string, optional — Pacific ISO code, default WS" },
  "pacific-travel": { destination: "string, required — Pacific ISO code", travel_window: "string, optional — next_30_days|next_90_days|christmas_2026|school_holidays, default next_90_days" },
  events: {
    country: "string, optional — ISO 3166-1 alpha-2",
    days_ahead: "integer, optional, 1-365, default 90",
    category: "string, optional — festival/concert/sport/cultural/religious/political/business/other",
  },
  weather: { country: "string, required — ISO 3166-1 alpha-2: WS, FJ, TO, PG, SB, VU, CK" },
  "wallet-balance": { address: "string, required — 58-character Algorand address" },
  "pacific-gdp": { years: "integer, optional, 1-60, default 15" },
  "pacific-population": { years: "integer, optional, 1-60, default 10" },
  "pacific-cpi": {},
  "samoa-entity-setup": { entity_type: "string, optional — ibc|trust|foundation|international_bank|insurance|partnership|mutual_fund|all, default all" },
  "samoa-compliance-status": {},
  "samoa-service-providers": {},
  "samoa-banking-setup": {},
  "pacific-setup-comparison": { nations: "string, optional — comma-separated ISO codes: ws,fj,vu,pg,to,sb (default: all)" },
  "pacific-tax-comparison": { nations: "string, optional — comma-separated ISO codes: ws,fj,vu,pg,to,sb (default: all)" },
  "pacific-land-tenure": { nations: "string, optional — comma-separated ISO codes: ws,fj,vu,pg,to,sb (default: all)" },
  "pacific-sector-restrictions": {
    sector: "string, optional — keyword filter e.g. fisheries, tourism, retail, construction",
    nations: "string, optional — comma-separated ISO codes: ws,fj,vu,pg,to,sb (default: all)",
  },
  "pacific-regulatory-scores": { nations: "string, optional — comma-separated ISO codes: ws,fj,vu,pg,to,sb (default: all, ranked by composite score DESC)" },
  "pacific-setup-checklist": {
    nation: "string, optional — ws|fj|vu|pg|to|sb (default: all 6 nations)",
    entity_type: "string, optional — company|sole_trader|partnership (default: company)",
  },
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
 * Executes one dataset's query against its direct-route's shared service
 * function, in-process. Each case mirrors the validation and error
 * handling of that dataset's own direct route exactly (see each route
 * file under routes/finance, routes/climate, routes/fisheries,
 * routes/intelligence, routes/pacific, routes/algorand) so the gateway
 * can never silently diverge from the direct endpoint's behaviour.
 */
async function runDatasetQuery(c: Context<AppBindings>, dataset: AgentDataset, params: Record<string, unknown> | undefined): Promise<unknown> {
  switch (dataset.datasetId) {
    case "samoa-cpi": {
      const years = parseYearsParam(params?.years as number | string | undefined);
      return getSamoaCpi(years);
    }

    case "samoa-gdp": {
      const { fiscalYear, all } = parseSamoaGdpParams(params?.fiscal_year as string | undefined, params?.all as string | boolean | undefined);
      return getSamoaGdp(fiscalYear, all);
    }

    case "fiji-gdp": {
      const { year, measure } = parseFijiGdpParams(params?.year as string | undefined, params?.measure as string | undefined);
      return getFijiGdp(year, measure);
    }

    case "fiji-cpi": {
      const filters = parseFijiCpiParams(params?.year as string | number | undefined, params?.from as string | undefined, params?.to as string | undefined);
      return getFijiCpi(filters);
    }

    case "fx": {
      return queryFx({
        from: params?.from as string | undefined,
        to: params?.to as string | undefined,
        amount: params?.amount as string | number | undefined,
        base: params?.base as string | undefined,
        pairs: params?.pairs as string | undefined,
        pacificOnly: params?.pacific_only as string | boolean | undefined,
      });
    }

    case "crypto-rates": {
      return queryCryptoRates({ category: params?.category as string | undefined, symbols: params?.symbols as string | undefined }, c.get("cryptoPricesKv"));
    }

    case "crypto-history": {
      return queryCryptoHistory({ symbol: params?.symbol as string | undefined, tf: params?.tf as string | undefined }, c.get("cryptoPricesKv"));
    }

    case "arbitrage-signals": {
      return queryArbitrageSignals({
        pair: params?.pair as string | undefined,
        chain: params?.chain as string | undefined,
        minSpreadPct: params?.min_spread_pct as string | number | undefined,
      });
    }

    case "remittance-corridors": {
      return queryRemittanceCorridors({
        corridor: params?.corridor as string | undefined,
        token: params?.token as string | undefined,
        minSavingPct: params?.min_saving_pct as string | number | undefined,
      });
    }

    case "ocean-temperature": {
      const country = parseOceanTemperatureCountry(params?.country as string | undefined);
      const result = await getPacificOceanClimate(country);
      if (!result) {
        throw new AppError(503, "service_unavailable", "Ocean climate data is temporarily unavailable. Try again shortly.");
      }
      return result;
    }

    case "pacific-ocean-temp": {
      const station = (params?.station as string | undefined) ?? DEFAULT_STATION;
      if (!isValidStation(station)) {
        throw new ValidationError(`station must be one of: ${VALID_STATIONS.join(", ")}`);
      }
      const result = await getPacificWaterTemperature(station);
      if (!result) {
        throw new AppError(503, "service_unavailable", "Water temperature data is temporarily unavailable. Try again shortly.");
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

    case "pacific-coral-bleaching": {
      const { lat, lon, radiusDeg } = parseCoralBleachingParams(params?.lat as string | number | undefined, params?.lon as string | number | undefined, params?.radius_deg as string | number | undefined);
      const result = await getCoralBleaching(lat, lon, radiusDeg);
      if (!result) {
        throw new AppError(502, "bad_gateway", "Coral bleaching data is temporarily unavailable from the upstream ERDDAP server. Try again shortly.");
      }
      return result;
    }

    case "pacific-cyclone-history": {
      return queryCycloneHistory({
        season: params?.season as string | undefined,
        nation: params?.nation as string | undefined,
        minCategory: params?.min_category as string | undefined,
        landfall: params?.landfall as string | undefined,
        limit: params?.limit as string | number | undefined,
      });
    }

    case "pacific-sea-level": {
      return querySeaLevel({
        station: params?.station as string | undefined,
        nation: params?.nation as string | undefined,
        from: params?.from as string | undefined,
        to: params?.to as string | undefined,
      });
    }

    case "pacific-enso-index": {
      return queryEnsoIndex({
        year: params?.year as string | undefined,
        from: params?.from as string | undefined,
        to: params?.to as string | undefined,
        phase: params?.phase as string | undefined,
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

    case "pacific-brief": {
      return queryPacificBrief({ topic: params?.topic as string | undefined, country: params?.country as string | undefined }, c.get("env"), c.get("supabase"));
    }

    case "pacific-travel": {
      return queryPacificTravelBrief({ destination: params?.destination as string | undefined, travelWindow: params?.travel_window as string | undefined }, c.get("env"), c.get("supabase"));
    }

    case "events": {
      return queryEvents(
        { country: params?.country as string | undefined, daysAhead: params?.days_ahead as string | number | undefined, category: params?.category as string | undefined },
        c.get("supabase"),
      );
    }

    case "weather": {
      const country = parseWeatherCountry(params?.country as string | undefined);
      const result = await getPacificWeather(country);
      if (!result) {
        throw new AppError(503, "service_unavailable", "Weather data is temporarily unavailable. Try again shortly.");
      }
      return result;
    }

    case "wallet-balance": {
      const address = params?.address as string | undefined;
      if (!address) {
        throw new ValidationError("address is required, e.g. { \"params\": { \"address\": \"ALGORAND_ADDRESS_58_CHARS\" } }");
      }
      if (!isValidAlgorandAddress(address)) {
        throw new ValidationError(`"${address}" is not a valid 58-character Algorand address`);
      }
      return getAlgorandWalletBalance(address, c.get("env"));
    }

    case "pacific-gdp": {
      const years = parsePacificGdpYearsParam(params?.years as number | string | undefined);
      return getPacificGdp(years);
    }

    case "pacific-population": {
      const years = parsePacificPopulationYearsParam(params?.years as number | string | undefined);
      return getPacificPopulation(years);
    }

    case "pacific-cpi": {
      return getPacificCpi();
    }

    case "samoa-entity-setup": {
      const rawEntityType = params?.entity_type as string | undefined;
      try {
        const entityType = parseEntityType(rawEntityType);
        return getEntitySetup(entityType);
      } catch (err) {
        throw new ValidationError(err instanceof Error ? err.message : "Invalid entity_type parameter");
      }
    }

    case "samoa-compliance-status": {
      return getComplianceStatus();
    }

    case "samoa-service-providers": {
      return getServiceProviders();
    }

    case "samoa-banking-setup": {
      return getBankingSetup();
    }

    case "pacific-setup-comparison": {
      const nationsStr = params?.nations as string | undefined;
      const codes = nationsStr
        ? (nationsStr.split(",").map((s) => s.trim().toLowerCase()) as NationCode[]).filter((c) =>
            (ALL_NATION_CODES as string[]).includes(c)
          )
        : undefined;
      return getSetupComparison(codes);
    }

    case "pacific-tax-comparison": {
      const nationsStr = params?.nations as string | undefined;
      const codes = nationsStr
        ? (nationsStr.split(",").map((s) => s.trim().toLowerCase()) as NationCode[]).filter((c) =>
            (ALL_NATION_CODES as string[]).includes(c)
          )
        : undefined;
      return getTaxComparison(codes);
    }

    case "pacific-land-tenure": {
      const nationsStr = params?.nations as string | undefined;
      const codes = nationsStr
        ? (nationsStr.split(",").map((s) => s.trim().toLowerCase()) as NationCode[]).filter((c) =>
            (ALL_NATION_CODES as string[]).includes(c)
          )
        : undefined;
      return getLandTenureComparison(codes);
    }

    case "pacific-sector-restrictions": {
      const sectorKeyword = params?.sector as string | undefined;
      const nationsStr = params?.nations as string | undefined;
      const codes = nationsStr
        ? (nationsStr.split(",").map((s) => s.trim().toLowerCase()) as NationCode[]).filter((c) =>
            (ALL_NATION_CODES as string[]).includes(c)
          )
        : undefined;
      return getSectorRestrictions(sectorKeyword, codes);
    }

    case "pacific-regulatory-scores": {
      const nationsStr = params?.nations as string | undefined;
      const codes = nationsStr
        ? (nationsStr.split(",").map((s) => s.trim().toLowerCase()) as NationCode[]).filter((c) =>
            (ALL_NATION_CODES as string[]).includes(c)
          )
        : undefined;
      return getRegulatoryScores(codes);
    }

    case "pacific-setup-checklist": {
      const nation = (params?.nation as string | undefined ?? "").toLowerCase();
      const entityType = (params?.entity_type as string | undefined ?? "company") as
        | "company"
        | "sole_trader"
        | "partnership";
      if (!["company", "sole_trader", "partnership"].includes(entityType)) {
        throw new ValidationError(`Invalid "entity_type". Valid values: company, sole_trader, partnership`);
      }
      if (!nation) {
        return ALL_NATION_CODES.map((code) => getSetupChecklist(code, entityType)).filter(
          (entry): entry is NonNullable<typeof entry> => entry !== null,
        );
      }
      if (!(ALL_NATION_CODES as string[]).includes(nation)) {
        throw new ValidationError(`Invalid "nation" param. Valid values: ${ALL_NATION_CODES.join(", ")}`);
      }
      const checklist = getSetupChecklist(nation as NationCode, entityType);
      if (!checklist) throw new NotFoundError(`No checklist data for nation "${nation}"`);
      return checklist;
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

  const result = await runDatasetQuery(c, dataset, params);

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
