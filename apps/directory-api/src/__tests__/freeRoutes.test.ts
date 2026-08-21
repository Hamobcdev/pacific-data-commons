import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { healthRoute } from "../routes/health.js";
import { categoriesRoute } from "../routes/categories.js";
import { countriesRoute } from "../routes/countries.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { createFakeSupabase } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

/**
 * Builds the same route wiring as src/index.ts but without the payment gate
 * (free routes don't need it, and constructing PdcPaymentGate would make a
 * real network call to the facilitator — out of scope for a unit test).
 */
function buildTestApp(supabase: ReturnType<typeof createFakeSupabase>, envOverrides: Partial<Env> = {}) {
  const app = new Hono<AppBindings>();
  const env = { ALGORAND_NETWORK: "testnet", ...envOverrides } as Env;

  app.use("*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("env", env);
    await next();
  });

  app.route("/", healthRoute);
  app.route("/", categoriesRoute);
  app.route("/", countriesRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /health", () => {
  it("returns 200 ok when the database is reachable", async () => {
    const app = buildTestApp(createFakeSupabase({ providers: { data: [], count: 0 } }));
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("returns 200 with a degraded body when the database errors — Railway's healthcheck must not restart-loop over a Supabase outage it can't fix", async () => {
    const app = buildTestApp(createFakeSupabase({ providers: { data: null, error: { message: "down" } } }));
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; database: string };
    expect(body.status).toBe("degraded");
    expect(body.database).toBe("unreachable");
  });

  it("surfaces the pending_recertification count (Decision 54 — informational, not an alert state)", async () => {
    const app = buildTestApp(
      createFakeSupabase({ providers: { data: [], count: 0 }, endpoints: { data: [], count: 2 } }),
    );
    const res = await app.request("/health");
    const body = (await res.json()) as { endpoints: { pending_recertification: number } };
    expect(body.endpoints.pending_recertification).toBe(2);
  });

  it("defaults pending_recertification to 0 when no endpoints table config is given", async () => {
    const app = buildTestApp(createFakeSupabase({ providers: { data: [], count: 0 } }));
    const res = await app.request("/health");
    const body = (await res.json()) as { endpoints: { pending_recertification: number } };
    expect(body.endpoints.pending_recertification).toBe(0);
  });

  it("publishes the canary block, unconfigured when AGENT_WALLET_ADDRESS is unset", async () => {
    const app = buildTestApp(createFakeSupabase({ providers: { data: [], count: 0 } }));
    const res = await app.request("/health");
    const body = (await res.json()) as { canary: { configured: boolean; wallet: string | null } };
    expect(body.canary.configured).toBe(false);
    expect(body.canary.wallet).toBeNull();
  });

  it("omits canary.policy_url (null) when WEB_APP_URL is unset — never guesses a URL that might 404", async () => {
    const app = buildTestApp(createFakeSupabase({ providers: { data: [], count: 0 } }));
    const res = await app.request("/health");
    const body = (await res.json()) as { canary: { policy_url: string | null } };
    expect(body.canary.policy_url).toBeNull();
  });

  it("builds canary.policy_url from WEB_APP_URL (Session 27 — Volume Integrity Policy)", async () => {
    const app = buildTestApp(createFakeSupabase({ providers: { data: [], count: 0 } }), {
      WEB_APP_URL: "https://pdcweb-production.up.railway.app",
    });
    const res = await app.request("/health");
    const body = (await res.json()) as { canary: { policy_url: string | null } };
    expect(body.canary.policy_url).toBe("https://pdcweb-production.up.railway.app/.well-known/volume-integrity-policy.json");
  });
});

describe("GET /categories", () => {
  it("returns the 20 substantive categories without the 'other' catch-all", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/categories");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { categories: string[] };
    expect(body.categories).toContain("fisheries");
    expect(body.categories).toContain("governance");
    expect(body.categories).not.toContain("other");
    expect(body.categories).toHaveLength(20);
  });
});

describe("GET /countries", () => {
  it("returns distinct, sorted countries from active providers", async () => {
    const app = buildTestApp(
      createFakeSupabase({
        providers: { data: [{ country: "Fiji" }, { country: "Samoa" }, { country: "Fiji" }] },
      }),
    );
    const res = await app.request("/countries");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { countries: string[] };
    expect(body.countries).toEqual(["Fiji", "Samoa"]);
  });
});

describe("unmatched routes", () => {
  it("returns a structured 404", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/nope");
    expect(res.status).toBe(404);
  });
});
