import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import { paidRoutes } from "../routeSchemas.js";

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
