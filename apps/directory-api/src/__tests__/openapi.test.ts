import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument, openapiRoute } from "../routes/openapi.js";
import { paidRoutes } from "../routeSchemas.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const NETWORKS = [
  { chain: "algorand", caip2: "algorand:test" },
  { chain: "base", caip2: "eip155:8453" },
];

type Operation = {
  operationId: string;
  parameters?: Array<{ name: string; in: string; required: boolean }>;
  responses: Record<string, unknown>;
  "x-x402": { price_usdc: number; networks: unknown };
};

describe("buildOpenApiDocument", () => {
  const doc = buildOpenApiDocument("https://api.example.test", NETWORKS, 0.01) as {
    openapi: string;
    servers: Array<{ url: string }>;
    paths: Record<string, Record<string, Operation>>;
  };

  it("is OpenAPI 3.1 with the public server URL", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0]!.url).toBe("https://api.example.test");
  });

  it("documents every paid route exactly once, with OpenAPI-style path params", () => {
    const ops = Object.entries(doc.paths).flatMap(([p, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${p}`));
    expect(ops).toHaveLength(paidRoutes.length);
    expect(doc.paths["/tourism/destination/{nation_code}"]?.get).toBeDefined();
    expect(Object.keys(doc.paths).some((p) => p.includes(":"))).toBe(false);
  });

  it("carries required query params from the route's discovery schema", () => {
    const weather = doc.paths["/pacific/weather"]!.get!;
    expect(weather.parameters).toContainEqual(expect.objectContaining({ name: "country", in: "query", required: true }));
  });

  it("documents the 402 challenge and the x402 price/networks on every operation", () => {
    for (const methods of Object.values(doc.paths)) {
      for (const op of Object.values(methods)) {
        expect(op.responses["402"]).toBeDefined();
        expect(op["x-x402"].networks).toEqual(NETWORKS);
        expect(op["x-x402"].price_usdc).toBeGreaterThan(0);
      }
    }
  });

  it("uses each route's own price, falling back to the directory fee", () => {
    for (const route of paidRoutes) {
      const op = doc.paths[route.path.replace(/:([A-Za-z_]+)/g, "{$1}")]![route.method.toLowerCase()]!;
      expect(op["x-x402"].price_usdc).toBe(route.priceUsdc ?? 0.01);
    }
  });

  it("gives every operation a unique operationId", () => {
    const ids = Object.values(doc.paths).flatMap((m) => Object.values(m).map((op) => op.operationId));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("GET /openapi.json", () => {
  it("serves the spec, free and CORS-open", async () => {
    const app = new Hono<AppBindings>();
    app.use("*", async (c, next) => {
      c.set("env", { PUBLIC_URL: "https://api.example.test" } as Env);
      c.set("paymentGate", { acceptedNetworks: () => NETWORKS } as unknown as AppBindings["Variables"]["paymentGate"]);
      await next();
    });
    app.route("/", openapiRoute);
    const res = await app.request("/openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await res.json()) as { openapi: string };
    expect(body.openapi).toBe("3.1.0");
  });
});
