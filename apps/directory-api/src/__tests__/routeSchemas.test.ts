import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import { paidRoutes, humanDeliverableRoutes } from "../routeSchemas.js";
import { AGENT_DATASET_CATALOG } from "../lib/agentDatasetCatalog.js";
import { INTERNAL_DATA_FETCH_ROUTES } from "../routes/internal/data-fetch.js";
import { HUMAN_DELIVERABLE_PATHS } from "@pdc/shared-types";

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

  it("charges samoa-cpi's own $0.20 (2026-10-18 pricing uplift, was $0.01)", () => {
    const route = gatewayRouteFor("samoa-cpi");
    expect(route).toBeDefined();
    expect(route?.priceUsdc).toBe(0.2);
  });

  it("registers exactly one POST /api/v1/datasets/:id/query entry per cataloged dataset — no flat shared-price entry survives", () => {
    const gatewayPostRoutes = paidRoutes.filter((r) => r.method === "POST" && r.path.startsWith("/api/v1/datasets/"));
    expect(gatewayPostRoutes.length).toBe(AGENT_DATASET_CATALOG.length);
    // 25 base datasets + 4 SIFA Samoa Jurisdiction Intelligence (Decision 63)
    // + 6 Pacific Investment Intelligence (#153) + 5 Vanuatu Jurisdiction
    // Intelligence (PR #183) = 40.
    expect(gatewayPostRoutes.length).toBe(40);

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

/**
 * humanDeliverable gates two independent surfaces (apps/web's buy-button
 * UI and data-fetch.ts's INTERNAL_DATA_FETCH_ROUTES) that are hand-
 * maintained in two different files. This suite guards the one invariant
 * that actually matters operationally: the internal-fetch map can never
 * contain a path the UI isn't also allowed to sell, which would let a
 * buyer pay for and receive data through a route humanDeliverable says
 * should never have been purchasable in the first place.
 */
describe("routeSchemas: humanDeliverable / INTERNAL_DATA_FETCH_ROUTES consistency", () => {
  it("every path wired into INTERNAL_DATA_FETCH_ROUTES is flagged humanDeliverable in routeSchemas.ts", () => {
    const humanDeliverablePaths = new Set(humanDeliverableRoutes.map((r) => r.path));
    const unflaggedWiredPaths = Object.keys(INTERNAL_DATA_FETCH_ROUTES).filter((p) => !humanDeliverablePaths.has(p));
    expect(unflaggedWiredPaths, `wired but not humanDeliverable: ${JSON.stringify(unflaggedWiredPaths)}`).toEqual([]);
  });

  it("every wired path is still a registered GET paidRoutes entry", () => {
    const registeredGetPaths = new Set(paidRoutes.filter((r) => r.method === "GET").map((r) => r.path));
    const orphanedWiredPaths = Object.keys(INTERNAL_DATA_FETCH_ROUTES).filter((p) => !registeredGetPaths.has(p));
    expect(orphanedWiredPaths, `wired but not a registered GET route: ${JSON.stringify(orphanedWiredPaths)}`).toEqual([]);
  });

  /**
   * apps/web cannot import apps/directory-api's routeSchemas.ts (separate
   * deployable, no runtime dependency between apps), so it reads
   * @pdc/shared-types' HUMAN_DELIVERABLE_PATHS for its own buy-button
   * gating instead. This is the one test standing between that list and
   * routeSchemas.ts's own per-route humanDeliverable flags silently
   * drifting apart — exactly the failure mode CLAUDE.md §26.2 and this
   * file's own Agent Dataset Gateway suite above guard against elsewhere.
   */
  it("routeSchemas.ts's humanDeliverableRoutes exactly matches @pdc/shared-types' HUMAN_DELIVERABLE_PATHS", () => {
    const fromRouteSchemas = [...humanDeliverableRoutes.map((r) => r.path)].sort();
    const fromSharedTypes = [...HUMAN_DELIVERABLE_PATHS].sort();
    expect(fromRouteSchemas).toEqual(fromSharedTypes);
  });
});
