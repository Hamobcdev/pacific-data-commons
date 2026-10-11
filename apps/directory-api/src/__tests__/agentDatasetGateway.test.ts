import { Hono } from "hono";
import nacl from "tweetnacl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentDatasetGatewayRoute } from "../routes/agentDatasetGateway.js";
import { __resetSamoaCpiCacheForTests } from "../services/samoaCpiService.js";
import { __resetFisheriesCacheForTests } from "../services/pacificFisheriesPurseSeineService.js";
import { __resetOceanForecastCacheForTests, HYCOM_POINTER_URL } from "../services/pacificOceanForecastService.js";
import { __resetFxRateCacheForTests } from "../services/fxRateService.js";
import { __resetCryptoRatesCacheForTests } from "../services/pacificCryptoRatesService.js";
import { __resetDexArbitrageCacheForTests } from "../services/pacificDexArbitrageService.js";
import { __resetRemittanceCacheForTests } from "../services/pacificRemittanceService.js";
import { __resetOceanClimateCacheForTests } from "../services/pacificOceanClimateService.js";
import { __resetWaterTemperatureCacheForTests } from "../services/pacificWaterTemperatureService.js";
import { __resetCoralBleachingCacheForTests } from "../services/pacificCoralBleachingService.js";
import { __resetWeatherCacheForTests } from "../services/pacificWeatherService.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { encodeAlgorandAddress } from "../lib/algorandAttestation.js";
import { createFakeSupabase } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const LEVEL_URL_PREFIX = "https://api.worldbank.org/v2/country/WSM/indicator/FP.CPI.TOTL?";
const INFLATION_URL_PREFIX = "https://api.worldbank.org/v2/country/WSM/indicator/FP.CPI.TOTL.ZG?";

function worldBankResponse(indicatorId: string, observations: Array<{ date: string; value: number | null }>) {
  return [
    { page: 1, pages: 1, per_page: observations.length, total: observations.length, sourceid: "2", lastupdated: "2026-07-13" },
    observations.map((o) => ({ indicator: { id: indicatorId, value: "x" }, country: { id: "WS", value: "Samoa" }, countryiso3code: "WSM", date: o.date, value: o.value, unit: "", obs_status: "", decimal: 1 })),
  ];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubWorldBankFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith(LEVEL_URL_PREFIX)) return jsonResponse(worldBankResponse("FP.CPI.TOTL", [{ date: "2025", value: 149.24 }]));
      if (url.startsWith(INFLATION_URL_PREFIX)) return jsonResponse(worldBankResponse("FP.CPI.TOTL.ZG", [{ date: "2025", value: 2.21 }]));
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

function knownWallet(): string {
  const keyPair = nacl.sign.keyPair();
  return encodeAlgorandAddress(keyPair.publicKey);
}

function buildTestApp(supabase: ReturnType<typeof createFakeSupabase>, envOverrides: Partial<Env> = {}) {
  const app = new Hono<AppBindings>();
  const env = { ...envOverrides } as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("supabase", supabase);
    await next();
  });

  app.route("/", agentDatasetGatewayRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /api/v1/datasets", () => {
  it("lists the catalog with samoa-cpi marked queryable", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/api/v1/datasets");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { datasets: Array<{ dataset_id: string; queryable: boolean; query_endpoint: string | null }> };
    const samoaCpi = body.datasets.find((d) => d.dataset_id === "samoa-cpi");
    expect(samoaCpi?.queryable).toBe(true);
    expect(samoaCpi?.query_endpoint).toBe("/api/v1/datasets/samoa-cpi/query");

    const fx = body.datasets.find((d) => d.dataset_id === "fx");
    expect(fx?.queryable).toBe(true);
    expect(fx?.query_endpoint).toBe("/api/v1/datasets/fx/query");

    // directory/meta routes are excluded from the dataset catalog
    expect(body.datasets.find((d) => d.dataset_id === "search")).toBeUndefined();
  });

  it("marks every cataloged dataset as queryable — Stream A Session 3 completeness guard (0 endpoints returning 501)", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/api/v1/datasets");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { datasets: Array<{ dataset_id: string; queryable: boolean; query_endpoint: string | null }> };
    expect(body.datasets.length).toBeGreaterThan(0);
    for (const dataset of body.datasets) {
      expect(dataset.queryable).toBe(true);
      expect(dataset.query_endpoint).toBe(`/api/v1/datasets/${dataset.dataset_id}/query`);
    }
  });
});

describe("GET /api/v1/manifests/:id", () => {
  it("returns a manifest for a known dataset", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/api/v1/manifests/samoa-cpi");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { dataset_id: string; queryable: boolean; provenance: { data_currency: string } };
    expect(body.dataset_id).toBe("samoa-cpi");
    expect(body.queryable).toBe(true);
    expect(body.provenance.data_currency).toBe("annual");
  });

  it("404s for an unknown dataset id", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/api/v1/manifests/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/datasets/:id/query", () => {
  beforeEach(() => {
    __resetSamoaCpiCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetSamoaCpiCacheForTests();
  });

  it("400s when X-Agent-Wallet header is missing", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/api/v1/datasets/samoa-cpi/query", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("400s when X-Agent-Wallet is not a valid Algorand address", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/api/v1/datasets/samoa-cpi/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": "not-a-wallet" },
    });
    expect(res.status).toBe(400);
  });

  it("403s when the wallet is well-formed but not a registered agent", async () => {
    const app = buildTestApp(createFakeSupabase({ agents: { data: [] } }));
    const res = await app.request("/api/v1/datasets/samoa-cpi/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": knownWallet() },
    });
    expect(res.status).toBe(403);
  });

  it("404s for a dataset id that isn't in the catalog at all", async () => {
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));
    const res = await app.request("/api/v1/datasets/not-a-real-dataset/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet },
    });
    expect(res.status).toBe(404);
  });

  it("200s for samoa-cpi with a known agent wallet, wrapping the result in a provenance envelope", async () => {
    stubWorldBankFetch();
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/samoa-cpi/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet, "content-type": "application/json" },
      body: JSON.stringify({ params: { years: 5 } }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      dataset_id: string;
      agent_wallet: string;
      provenance: { data_currency: string; upstream_source: string };
      result: { country: string; observations: unknown[] };
    };
    expect(body.dataset_id).toBe("samoa-cpi");
    expect(body.agent_wallet).toBe(wallet);
    expect(body.provenance.data_currency).toBe("annual");
    expect(body.result.country).toBe("Samoa");
  });

  it("200s with no body at all (years defaults to 15)", async () => {
    stubWorldBankFetch();
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/samoa-cpi/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet },
    });
    expect(res.status).toBe(200);
  });

  it("400s on an out-of-range years param, same bound as the direct route", async () => {
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/samoa-cpi/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet, "content-type": "application/json" },
      body: JSON.stringify({ params: { years: 0 } }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/pacific-sea-level/query", () => {
  it("200s with no body at all, no filters applied", async () => {
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/pacific-sea-level/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { dataset_id: string; result: { data: unknown[]; meta: { data_currency: string } } };
    expect(body.dataset_id).toBe("pacific-sea-level");
    expect(body.result.meta.data_currency).toBe("monthly");
  });

  it("200s and applies the nation filter from the request body", async () => {
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/pacific-sea-level/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet, "content-type": "application/json" },
      body: JSON.stringify({ params: { nation: "TV" } }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { result: { data: Array<{ nation: string }> } };
    expect(body.result.data.length).toBeGreaterThan(0);
    expect(body.result.data.every((r) => r.nation === "TV")).toBe(true);
  });
});

// Reused from __tests__/pacificFisheriesPurseSeine.test.ts — 4 months
// (indices 624–627) of a 628-entry time array; indices 625–627 are the 3
// months found for year 2021 (see that file's own comment for the exact
// day-offset derivation).
const PURSE_SEINE_TIME_ASCII = [
  "Dataset {",
  "    Float64 time[time = 628];",
  "} PCCOS/WCPFC/WCPFC_S_PUBLIC_BY_1x1_MM.nc;",
  "---------------------------------------------",
  "time[628]",
  `${"0.0, ".repeat(624)}19373.0, 19404.0, 19555.0, 19724.0`,
].join("\n");

function purseSeineGridAscii(varName: string, timeCount: number, perMonth: number): string {
  const lines = [
    "Dataset {",
    "    Grid {",
    "     ARRAY:",
    `        Float64 ${varName}[time = ${timeCount}][latitude = 100][longitude = 124];`,
    "     MAPS:",
    `        Float64 time[time = ${timeCount}];`,
    "        Float64 latitude[latitude = 100];",
    "        Float64 longitude[longitude = 124];",
    `    } ${varName};`,
    "} PCCOS/WCPFC/WCPFC_S_PUBLIC_BY_1x1_MM.nc;",
    "---------------------------------------------",
    `${varName}.${varName}[${timeCount}][100][124]`,
  ];
  for (let t = 0; t < timeCount; t++) {
    lines.push(`[${t}][0], ${perMonth}${", NaN".repeat(123)}`);
    for (let lat = 1; lat < 100; lat++) lines.push(`[${t}][${lat}], NaN${", NaN".repeat(123)}`);
  }
  lines.push(`time[${timeCount}]`, Array.from({ length: timeCount }, () => "0.0").join(", "));
  return lines.join("\n");
}

describe("POST /api/v1/datasets/pacific-purse-seine/query", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetFisheriesCacheForTests();
  });

  it("200s with species+year params, wrapping the real purse-seine result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith(".ascii?time")) return new Response(PURSE_SEINE_TIME_ASCII, { status: 200 });
        if (url.includes("skj_c_")) return new Response(purseSeineGridAscii("skj_c_x", 3, 10), { status: 200 });
        return new Response("", { status: 404 });
      }),
    );
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/pacific-purse-seine/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet, "content-type": "application/json" },
      body: JSON.stringify({ params: { species: "skj", year: 2021 } }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { dataset_id: string; result: { species_code: string; total_catch_mt: number } };
    expect(body.dataset_id).toBe("pacific-purse-seine");
    expect(body.result.species_code).toBe("skj");
    // 5 gear vars * 3 months * 10mt = 150mt, same arithmetic as the direct-route test.
    expect(body.result.total_catch_mt).toBe(150);
  });

  it("400s when year is missing from params, same bound as the direct route", async () => {
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/pacific-purse-seine/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet, "content-type": "application/json" },
      body: JSON.stringify({ params: { species: "skj" } }),
    });
    expect(res.status).toBe(400);
  });

  it("400s for species=alb with the same explicit explanation as the direct route", async () => {
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/pacific-purse-seine/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet, "content-type": "application/json" },
      body: JSON.stringify({ params: { species: "alb", year: 2021 } }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("longline");
  });
});

const OCEAN_SEP = "---------------------------------------------";

function oceanFlatArrayAscii(dim: string, values: number[]): string {
  return ["Dataset {", `    Float64 ${dim}[${dim} = ${values.length}];`, "} PCCOS/HYCOM/GLBy0.08_930_FMRC_best_20261004.nc;", OCEAN_SEP, `${dim}[${values.length}]`, values.join(", ")].join(
    "\n",
  );
}

// -30,-25,-10,0,10,25,30 — indices 1..5 fall inside -25..25.
const OCEAN_LAT_ASCII = oceanFlatArrayAscii("lat", [-30, -25, -10, 0, 10, 25, 30]);
// 140,150,170,200,220,230 — indices 1..4 fall inside 150..220.
const OCEAN_LON_ASCII = oceanFlatArrayAscii("lon", [140, 150, 170, 200, 220, 230]);
const OCEAN_TIME_ZERO_ASCII = oceanFlatArrayAscii("time", [0.0]);

function oceanGrid3Ascii(varName: string, lon0: number, lon1: number): string {
  return [
    "Dataset {",
    "    Grid {",
    "     ARRAY:",
    `        Float32 ${varName}[time = 1][depth = 1][lat = 2][lon = 2];`,
    "     MAPS:",
    "        Float64 time[time = 1];",
    "        Float64 depth[depth = 1];",
    "        Float64 lat[lat = 2];",
    "        Float64 lon[lon = 2];",
    `    } ${varName};`,
    "} PCCOS/HYCOM/GLBy0.08_930_FMRC_best_20261004.nc;",
    OCEAN_SEP,
    `${varName}.${varName}[1][1][2][2]`,
    `[0][0][0], ${lon0}, ${lon1}`,
    `[0][0][1], ${lon0}, NaN`,
  ].join("\n");
}

function oceanGrid2Ascii(varName: string, lon0: number, lon1: number): string {
  return [
    "Dataset {",
    "    Grid {",
    "     ARRAY:",
    `        Float32 ${varName}[time = 1][lat = 2][lon = 2];`,
    "     MAPS:",
    "        Float64 time[time = 1];",
    "        Float64 lat[lat = 2];",
    "        Float64 lon[lon = 2];",
    `    } ${varName};`,
    "} PCCOS/HYCOM/GLBy0.08_930_FMRC_best_20261004.nc;",
    OCEAN_SEP,
    `${varName}.${varName}[1][2][2]`,
    `[0][0], ${lon0}, ${lon1}`,
    `[0][1], ${lon0}, NaN`,
  ].join("\n");
}

function stubOceanForecastFetch() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === HYCOM_POINTER_URL) return new Response("20261004", { status: 200 });
    if (url.includes(".ascii?lat")) return new Response(OCEAN_LAT_ASCII, { status: 200 });
    if (url.includes(".ascii?lon")) return new Response(OCEAN_LON_ASCII, { status: 200 });
    if (url.includes(".ascii?time")) return new Response(OCEAN_TIME_ZERO_ASCII, { status: 200 });
    if (url.includes("water_temp")) return new Response(oceanGrid3Ascii("water_temp", 27, 28), { status: 200 });
    if (url.includes("water_u")) return new Response(oceanGrid3Ascii("water_u", 0.1, 0.1), { status: 200 });
    if (url.includes("water_v")) return new Response(oceanGrid3Ascii("water_v", 0.0, 0.0), { status: 200 });
    if (url.includes("surf_el")) return new Response(oceanGrid2Ascii("surf_el", 0.2, 0.2), { status: 200 });
    return new Response("", { status: 404 });
  });
}

describe("POST /api/v1/datasets/pacific-ocean-forecast/query", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetOceanForecastCacheForTests();
  });

  it("200s with no params needed, wrapping the real forecast result", async () => {
    vi.stubGlobal("fetch", stubOceanForecastFetch());
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/pacific-ocean-forecast/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { dataset_id: string; result: { data_currency: string; model: string } };
    expect(body.dataset_id).toBe("pacific-ocean-forecast");
    expect(body.result.data_currency).toBe("daily-forecast");
    expect(body.result.model).toBe("HYCOM GLBy0.08 Global Ocean Model");
  });

  it("502s (not 500) when the upstream pointer fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/pacific-ocean-forecast/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet },
    });
    expect(res.status).toBe(502);
  });
});

// --- Session 3: the remaining 18 cataloged datasets ---------------------

function agentWallet(): { wallet: string; app: ReturnType<typeof buildTestApp> } {
  const wallet = knownWallet();
  const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));
  return { wallet, app };
}

async function postQuery(app: ReturnType<typeof buildTestApp>, wallet: string, datasetId: string, params?: Record<string, unknown>) {
  return app.request(`/api/v1/datasets/${datasetId}/query`, {
    method: "POST",
    headers: { "X-Agent-Wallet": wallet, "content-type": "application/json" },
    body: JSON.stringify({ params }),
  });
}

describe("POST /api/v1/datasets/samoa-gdp/query", () => {
  it("200s with a valid fiscal_year", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "samoa-gdp", { fiscal_year: "2024/25" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_id: string };
    expect(body.dataset_id).toBe("samoa-gdp");
  });

  it("400s for an unsupported fiscal_year", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "samoa-gdp", { fiscal_year: "1999/00" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/fiji-gdp/query", () => {
  it("200s with a valid year", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "fiji-gdp", { year: "2019" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_id: string };
    expect(body.dataset_id).toBe("fiji-gdp");
  });

  it("400s when year is missing", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "fiji-gdp", {});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/fiji-cpi/query", () => {
  it("200s with no params", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "fiji-cpi");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_id: string };
    expect(body.dataset_id).toBe("fiji-cpi");
  });

  it("400s for a malformed from param", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "fiji-cpi", { from: "not-a-date" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/fx/query", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetFxRateCacheForTests();
  });

  it("200s, falling back to static-only rates when every live source is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "fx");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_id: string; result: { source: string } };
    expect(body.dataset_id).toBe("fx");
    expect(body.result.source).toBe("static-only");
  });

  it("400s when a conversion request is missing amount", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "fx", { from: "WST", to: "USD" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/crypto-rates/query", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetCryptoRatesCacheForTests();
  });

  it("200s, falling back to the static token set when CoinGecko is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "crypto-rates");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_id: string; result: { static_fallback: boolean } };
    expect(body.dataset_id).toBe("crypto-rates");
    expect(body.result.static_fallback).toBe(true);
  });

  it("400s for an unrecognised category", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "crypto-rates", { category: "not-a-category" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/crypto-history/query", () => {
  it("200s with an empty point set when no KV binding is available (Node local dev posture)", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "crypto-history", { symbol: "ALGO" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_id: string; result: { symbol: string; points: unknown[] } };
    expect(body.dataset_id).toBe("crypto-history");
    expect(body.result.symbol).toBe("ALGO");
    expect(body.result.points).toEqual([]);
  });

  it("400s when symbol is missing", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "crypto-history", {});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/arbitrage-signals/query", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetDexArbitrageCacheForTests();
  });

  it("502s when every DEX source is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "arbitrage-signals");
    expect(res.status).toBe(502);
  });

  it("400s for a non-curated pair", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "arbitrage-signals", { pair: "NOT/APAIR" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/remittance-corridors/query", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetRemittanceCacheForTests();
  });

  it("200s, falling back to static corridor costs when World Bank's live feed is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "remittance-corridors");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_id: string };
    expect(body.dataset_id).toBe("remittance-corridors");
  });

  it("400s for an unknown corridor", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "remittance-corridors", { corridor: "NOT_A_CORRIDOR" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/ocean-temperature/query", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetOceanClimateCacheForTests();
  });

  it("503s (not 500) when Open-Meteo Marine is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "ocean-temperature", { country: "WS" });
    expect(res.status).toBe(503);
  });

  it("400s when country is missing", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "ocean-temperature", {});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/pacific-ocean-temp/query", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetWaterTemperatureCacheForTests();
  });

  it("503s (not 500) when NOAA CO-OPS is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "pacific-ocean-temp");
    expect(res.status).toBe(503);
  });

  it("400s for an unrecognised station", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "pacific-ocean-temp", { station: "not-a-station" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/pacific-coral-bleaching/query", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetCoralBleachingCacheForTests();
  });

  it("502s (not 500) when the upstream ERDDAP server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "pacific-coral-bleaching");
    expect(res.status).toBe(502);
  });

  it("400s for an out-of-range lat", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "pacific-coral-bleaching", { lat: 200 });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/pacific-cyclone-history/query", () => {
  it("200s with a nation filter", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "pacific-cyclone-history", { nation: "FJ" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_id: string; result: { data: Array<{ nations: string[] }> } };
    expect(body.dataset_id).toBe("pacific-cyclone-history");
    expect(body.result.data.every((s) => s.nations.includes("FJ"))).toBe(true);
  });

  it("200s with no params at all", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "pacific-cyclone-history");
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/datasets/pacific-enso-index/query", () => {
  it("200s with a phase filter", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "pacific-enso-index", { phase: "elnino" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_id: string; result: { data: Array<{ phase: string }> } };
    expect(body.dataset_id).toBe("pacific-enso-index");
    expect(body.result.data.every((r) => r.phase === "elnino")).toBe(true);
  });

  it("200s with no params at all", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "pacific-enso-index");
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/datasets/pacific-brief/query", () => {
  it("503s when the intelligence synthesis service is not configured (no ANTHROPIC_API_KEY)", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "pacific-brief");
    expect(res.status).toBe(503);
  });

  it("400s for an unrecognised topic", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "pacific-brief", { topic: "not-a-topic" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/pacific-travel/query", () => {
  it("503s when the travel intelligence synthesis service is not configured (no ANTHROPIC_API_KEY)", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "pacific-travel", { destination: "WS" });
    expect(res.status).toBe(503);
  });

  it("400s when destination is missing", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "pacific-travel", {});
    expect(res.status).toBe(400);
  });
});

const GATEWAY_TEST_EVENT = {
  id: "evt-1",
  name: "Teuila Tourism Festival",
  description: "Samoa's premier annual tourism and cultural festival.",
  category: "festival",
  subcategory: "cultural",
  country_code: "WS",
  country_name: "Samoa",
  city: "Apia",
  start_date: "2026-09-01",
  end_date: "2026-09-05",
  expected_attendance: 50000,
  tourism_impact: "very_high",
  international_visitors: true,
  diaspora_draw: true,
  highlights: ["Traditional fiafia nights"],
  travel_tips: "Book at least 2 months ahead.",
  booking_lead_time: "2 months ahead",
  source: "Samoa Tourism Authority",
  data_quality: "verified",
};

describe("POST /api/v1/datasets/events/query", () => {
  it("200s with the configured events", async () => {
    const wallet = knownWallet();
    const app = buildTestApp(
      createFakeSupabase({
        agents: { data: [{ id: "agent-1", operational_wallet: wallet }] },
        pacific_events: { data: [GATEWAY_TEST_EVENT] },
      }),
    );
    const res = await postQuery(app, wallet, "events");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_id: string; result: { results: unknown[]; count: number } };
    expect(body.dataset_id).toBe("events");
    expect(body.result.count).toBe(1);
  });

  it("400s for an unrecognised country", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "events", { country: "ZZ" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/weather/query", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetWeatherCacheForTests();
  });

  it("503s (not 500) when Open-Meteo is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "weather", { country: "WS" });
    expect(res.status).toBe(503);
  });

  it("400s when country is missing", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "weather", {});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/datasets/wallet-balance/query", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("200s with balances on a valid address and a healthy node", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            amount: 12_500_000,
            status: "Online",
            "min-balance": 100_000,
            assets: [{ "asset-id": 31566704, amount: 100_250_000 }],
          }),
          { status: 200 },
        ),
      ),
    );
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }), {
      ALGORAND_NODE_URL: "https://mainnet-api.4160.nodely.io",
    });
    const validTargetAddress = "A".repeat(58);

    const res = await postQuery(app, wallet, "wallet-balance", { address: validTargetAddress });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_id: string; result: { usdc_balance: number } };
    expect(body.dataset_id).toBe("wallet-balance");
    expect(body.result.usdc_balance).toBe(100.25);
  });

  it("400s for a malformed address", async () => {
    const { wallet, app } = agentWallet();
    const res = await postQuery(app, wallet, "wallet-balance", { address: "not-a-wallet" });
    expect(res.status).toBe(400);
  });
});
