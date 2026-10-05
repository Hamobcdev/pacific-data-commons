import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { wellKnownX402Route } from "../routes/wellKnownX402.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const TEST_AVM_ADDRESS = "LN745UCDQNFIBDY6JFW7FNK333MADQZQVQFMCVR3GXXUTB52O2NYPZN3YY";

function buildTestApp(envOverrides: Partial<Env> = {}) {
  const app = new Hono<AppBindings>();
  const env = {
    PUBLIC_URL: "https://api.synergybcpacific.com",
    ALGORAND_NETWORK: "mainnet",
    AVM_ADDRESS: TEST_AVM_ADDRESS,
    FACILITATOR_URL: "https://facilitator.goplausible.xyz",
    WEB_APP_URL: "https://pdc.synergybcpacific.com",
    ...envOverrides,
  } as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });

  app.route("/", wellKnownX402Route);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /.well-known/x402", () => {
  it("returns the discovery manifest with CORS and cache headers", async () => {
    const app = buildTestApp();
    const res = await app.request("/.well-known/x402");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600, stale-while-revalidate=86400");

    const body = (await res.json()) as {
      provider: string;
      network: string;
      caip2: string;
      endpoints: Array<{ path: string; pay_to: string; category: string }>;
      agents: { marketplace_url: string | null; catalogue: Array<{ id: string }> };
      docs: string | null;
    };

    expect(body.provider).toBe("Pacific Data Commons");
    expect(body.network).toBe("algorand-mainnet");
    expect(body.caip2).toContain("algorand:");
    expect(body.docs).toBe("https://pdc.synergybcpacific.com/en/developers");

    const paths = body.endpoints.map((e) => e.path);
    expect(paths).toEqual(["/finance/samoa-cpi", "/climate/ocean-temperature", "/finance/samoa-gdp", "/search"]);

    const searchEndpoint = body.endpoints.find((e) => e.path === "/search");
    expect(searchEndpoint?.pay_to).toBe(TEST_AVM_ADDRESS);

    const cpiEndpoint = body.endpoints.find((e) => e.path === "/finance/samoa-cpi");
    expect(cpiEndpoint?.pay_to).not.toBe(TEST_AVM_ADDRESS); // pilot-earnings wallet, not the main directory wallet

    expect(body.agents.marketplace_url).toBe("https://pdc.synergybcpacific.com/en/agents");
    expect(body.agents.catalogue.length).toBe(7);
  });

  it("omits docs and agents.marketplace_url rather than fabricating a domain when WEB_APP_URL isn't set", async () => {
    const app = buildTestApp({ WEB_APP_URL: undefined });
    const res = await app.request("/.well-known/x402");
    const body = (await res.json()) as { docs: string | null; agents: { marketplace_url: string | null } };

    expect(body.docs).toBeNull();
    expect(body.agents.marketplace_url).toBeNull();
  });

  it("responds to OPTIONS with 204 and CORS headers", async () => {
    const app = buildTestApp();
    const res = await app.request("/.well-known/x402", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
