import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { apiDataAliasHandler, API_DATA_ROUTE_ALIASES } from "../app.js";
import { notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";

/**
 * Standalone app wrapping just apiDataAliasHandler — not the real
 * createApp() (Supabase/env/PdcPaymentGate construction is out of scope
 * for this unit test, same posture as facilitatorTimeout.test.ts's own
 * minimal app).
 */
function buildTestApp() {
  const app = new Hono<AppBindings>();
  app.get("/api/data/:path{.+}", apiDataAliasHandler);
  app.notFound(notFoundHandler);
  return app;
}

describe("API_DATA_ROUTE_ALIASES", () => {
  it("covers exactly the 14 documented aliases, no more, no fewer", () => {
    expect(API_DATA_ROUTE_ALIASES).toEqual({
      "samoa-cpi": "/finance/samoa-cpi",
      "samoa-gdp": "/finance/samoa-gdp",
      "ocean-temperature": "/climate/ocean-temperature",
      "pacific-ocean-temp": "/climate/pacific-ocean-temp",
      "ocean-forecast": "/climate/pacific-ocean-forecast",
      "coral-bleaching": "/climate/pacific-coral-bleaching",
      "purse-seine": "/fisheries/pacific-purse-seine",
      search: "/search",
      fx: "/finance/fx",
      "crypto-prices": "/finance/crypto-rates",
      "fx-rates": "/finance/fx",
      "crypto-rates": "/finance/crypto-rates",
      "arbitrage-signals": "/finance/arbitrage-signals",
      "remittance-corridors": "/finance/remittance-corridors",
    });
  });
});

describe("GET /api/data/:path (alias redirects)", () => {
  it.each(Object.entries(API_DATA_ROUTE_ALIASES))("redirects /api/data/%s to %s with a 301", async (alias, target) => {
    const app = buildTestApp();
    const res = await app.request(`/api/data/${alias}`, { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(target);
  });

  it("preserves the original query string verbatim on redirect", async () => {
    const app = buildTestApp();
    const res = await app.request("/api/data/crypto-rates?symbols=BTC,ETH&category=l1", { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/finance/crypto-rates?symbols=BTC,ETH&category=l1");
  });

  it("redirects with no query string when none was given", async () => {
    const app = buildTestApp();
    const res = await app.request("/api/data/search", { redirect: "manual" });
    expect(res.headers.get("location")).toBe("/search");
  });

  it("falls through to 404 for a path under /api/data/ that isn't a known alias", async () => {
    const app = buildTestApp();
    const res = await app.request("/api/data/not-a-real-alias");
    expect(res.status).toBe(404);
  });

  it("falls through to 404 for a nested unknown path under /api/data/", async () => {
    const app = buildTestApp();
    const res = await app.request("/api/data/some/nested/thing");
    expect(res.status).toBe(404);
  });
});
