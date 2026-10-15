import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import { paidRoutes } from "../routeSchemas.js";
import { AGENT_DATASET_CATALOG } from "../lib/agentDatasetCatalog.js";

/**
 * Guards against a genuinely broken bazaar discovery schema (duplicate
 * $id, a $ref to a schema never registered, an invalid keyword, etc.)
 * reaching production undetected. Same Ajv2020 + strict:false config
 * @x402/extensions' own bazaar validator uses (see
 * node_modules/@x402/extensions/dist/cjs/bazaar/index.js). See
 * apps/pilot-endpoint/src/routeSchemas.test.ts for why this is a
 * deliberately narrower guarantee than "compiles inside Cloudflare
 * Workers" — see packages/pdc-x402-adapter/src/bazaarAjvWorkersLogFilter.ts
 * for that separate, known, non-fatal platform restriction.
 */
describe("routeSchemas: bazaar discovery schemas", () => {
  const routesWithDiscovery = paidRoutes.filter((route) => route.discovery !== undefined);

  for (const route of routesWithDiscovery) {
    it(`${route.method} ${route.path} discovery.schema compiles with ajv.compile()`, () => {
      const ajv = new Ajv2020({ strict: false, allErrors: true });
      expect(() => ajv.compile(route.discovery!.schema)).not.toThrow();
    });
  }

  it("no two routes declare the same discovery.schema $id", () => {
    const idsByRoute = new Map<string, string[]>();
    for (const route of routesWithDiscovery) {
      const json = JSON.stringify(route.discovery!.schema);
      for (const match of json.matchAll(/"\$id":"([^"]+)"/g)) {
        const id = match[1]!;
        idsByRoute.set(id, [...(idsByRoute.get(id) ?? []), `${route.method} ${route.path}`]);
      }
    }
    const duplicates = [...idsByRoute.entries()].filter(([, routes]) => routes.length > 1);
    expect(duplicates, `duplicate $id across routes: ${JSON.stringify(duplicates)}`).toEqual([]);
  });
});

/**
 * Agent Dataset Gateway per-dataset pricing fix (Stream A, found during
 * Session 3 review): POST /api/v1/datasets/:id/query used to be ONE
 * flat-priced paidRoutes entry shared across every dataset id, so
 * querying pacific-sea-level ($0.15 directly) through the gateway only
 * charged $0.01. paidRoutes now has one literal POST entry per cataloged
 * dataset, each priced identically to that dataset's own direct GET
 * route (see routeSchemas.ts's agentDatasetGatewayRoutes). This suite
 * guards both that the fix is actually in place and that the two
 * hand-maintained path lists (AGENT_DATASET_GATEWAY_DIRECT_PATHS in
 * routeSchemas.ts, DATASET_METADATA in lib/agentDatasetCatalog.ts) can't
 * silently drift apart.
 */
describe("routeSchemas: Agent Dataset Gateway per-dataset pricing", () => {
  function gatewayRouteFor(datasetId: string) {
    return paidRoutes.find((r) => r.method === "POST" && r.path === `/api/v1/datasets/${datasetId}/query`);
  }

  it("charges pacific-sea-level's own $0.15, not a flat $0.01", () => {
    const route = gatewayRouteFor("pacific-sea-level");
    expect(route).toBeDefined();
    expect(route?.priceUsdc).toBe(0.15);
  });

  it("charges samoa-cpi's own $0.01", () => {
    const route = gatewayRouteFor("samoa-cpi");
    expect(route).toBeDefined();
    expect(route?.priceUsdc).toBe(0.01);
  });

  it("registers exactly one POST /api/v1/datasets/:id/query entry per cataloged dataset — no flat shared-price entry survives", () => {
    const gatewayPostRoutes = paidRoutes.filter((r) => r.method === "POST" && r.path.startsWith("/api/v1/datasets/"));
    expect(gatewayPostRoutes.length).toBe(AGENT_DATASET_CATALOG.length);
    // 25 base datasets + 4 SIFA Samoa Jurisdiction Intelligence (Decision 63)
    // + 6 Pacific Investment Intelligence (#153) = 35.
    expect(gatewayPostRoutes.length).toBe(35);

    // The old flat entry used a literal ":id" path segment — confirms it's gone.
    expect(paidRoutes.some((r) => r.path === "/api/v1/datasets/:id/query")).toBe(false);
  });

  it("every cataloged dataset's gateway POST price and wallet exactly match its own direct GET route — no drift between the two dataset-path lists", () => {
    for (const dataset of AGENT_DATASET_CATALOG) {
      const directRoute = paidRoutes.find((r) => r.method === "GET" && r.path === dataset.path);
      const gatewayRoute = gatewayRouteFor(dataset.datasetId);

      expect(directRoute, `no direct GET paidRoutes entry for "${dataset.path}"`).toBeDefined();
      expect(gatewayRoute, `no gateway POST paidRoutes entry for dataset "${dataset.datasetId}"`).toBeDefined();

      expect(gatewayRoute?.priceUsdc).toBe(directRoute?.priceUsdc);
      expect(gatewayRoute?.payToAddress).toBe(directRoute?.payToAddress);
    }
  });
});
