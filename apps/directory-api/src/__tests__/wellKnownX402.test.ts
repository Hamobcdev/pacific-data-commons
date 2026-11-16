import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { buildResources, wellKnownX402Route } from "../routes/wellKnownX402.js";
import { AGENT_DATASET_CATALOG } from "../lib/agentDatasetCatalog.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const TEST_AVM_ADDRESS = "LN745UCDQNFIBDY6JFW7FNK333MADQZQVQFMCVR3GXXUTB52O2NYPZN3YY";

function buildTestApp(envOverrides: Partial<Env> = {}, acceptedNetworks?: Array<{ chain: string; caip2: string }>) {
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
    if (acceptedNetworks) {
      c.set("paymentGate", { acceptedNetworks: () => acceptedNetworks } as unknown as AppBindings["Variables"]["paymentGate"]);
    }
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
      endpoints: Array<{ path: string; pay_to: string; category: string; price_usdc: string }>;
      agents: { marketplace_url: string | null; catalogue: Array<{ id: string }> };
      docs: string | null;
    };

    expect(body.provider).toBe("Pacific Data Commons");
    expect(body.network).toBe("algorand-mainnet");
    expect(body.caip2).toContain("algorand:");
    expect(body.docs).toBe("https://pdc.synergybcpacific.com/en/developers");

    // Session 3 — derived from AGENT_DATASET_CATALOG (22 datasets) + /search,
    // not a hand-written list — see routes/wellKnownX402.ts's buildEndpoints().
    expect(body.endpoints.length).toBe(AGENT_DATASET_CATALOG.length + 1);

    const paths = body.endpoints.map((e) => e.path);
    expect(paths).toContain("/search");
    for (const dataset of AGENT_DATASET_CATALOG) {
      expect(paths).toContain(dataset.path);
    }

    const searchEndpoint = body.endpoints.find((e) => e.path === "/search");
    expect(searchEndpoint?.pay_to).toBe(TEST_AVM_ADDRESS);

    const cpiEndpoint = body.endpoints.find((e) => e.path === "/finance/samoa-cpi");
    // 2026-10-13 wallet consolidation retired the separate pilot-earnings
    // wallet — this route now pays AVM_ADDRESS same as every other route.
    // It still won't equal TEST_AVM_ADDRESS here because routeSchemas.ts
    // resolves this payToAddress from raw process.env at module-import
    // time (pre-existing behaviour, same as /finance/crypto-rates and
    // /climate/pacific-ocean-temp above), not from this test's per-request
    // Hono env override — so it resolves empty in this test process rather
    // than to TEST_AVM_ADDRESS specifically.
    expect(cpiEndpoint?.pay_to).not.toBe(TEST_AVM_ADDRESS);

    const seaLevelEndpoint = body.endpoints.find((e) => e.path === "/climate/pacific-sea-level");
    expect(seaLevelEndpoint?.price_usdc).toBe("0.05"); // sourced from paidRoutes, not a flat default (reprice/november-2026, was 0.15)

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

describe("/.well-known/x402 resources and networks (x402 Doctor re-scan, 16 Nov 2026)", () => {
  it("lists a flat resources[] of callable URLs, matching the description's count", async () => {
    const app = buildTestApp();
    const body = (await (await app.request("/.well-known/x402")).json()) as { resources: string[]; description: string };
    expect(body.resources.length).toBeGreaterThan(50);
    expect(body.resources).toContain("https://api.synergybcpacific.com/pacific/weather");
    expect(body.resources).toContain("https://api.synergybcpacific.com/tourism/destination/WS");
    expect(body.resources.every((u) => u.startsWith("https://api.synergybcpacific.com/") && !u.includes(":", 7))).toBe(true);
    expect(body.description.startsWith(`${body.resources.length} live`)).toBe(true);
  });

  it("leaves out routes whose path param has no public example (provider/endpoint/verify ids)", () => {
    const resources = buildResources("https://x.test");
    expect(resources.some((u) => u.includes("/provider/") || u.includes("/endpoint/") || u.includes("/verify/"))).toBe(false);
  });

  it("does not list the POST Agent Dataset Gateway routes", () => {
    expect(buildResources("https://x.test").some((u) => u.includes("/api/v1/datasets/"))).toBe(false);
  });

  it("reports every chain the gate accepts in networks[], and names them in the description", async () => {
    const networks = [
      { chain: "algorand", caip2: "algorand:mainnet-test" },
      { chain: "base", caip2: "eip155:8453" },
      { chain: "solana", caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" },
    ];
    const app = buildTestApp({}, networks);
    const body = (await (await app.request("/.well-known/x402")).json()) as { networks: unknown; description: string; network: string };
    expect(body.networks).toEqual(networks);
    expect(body.description).toContain("Algorand, Base or Solana");
    expect(body.network).toBe("algorand-mainnet");
  });

  it("falls back to Algorand only when no gate is bound", async () => {
    const body = (await (await buildTestApp().request("/.well-known/x402")).json()) as { networks: Array<{ chain: string }> };
    expect(body.networks.map((n) => n.chain)).toEqual(["algorand"]);
  });
});
