import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import { paidRoutes } from "./routeSchemas.js";

/**
 * Guards against a genuinely broken bazaar discovery schema (duplicate
 * $id, a $ref to a schema never registered, an invalid keyword, etc.)
 * reaching production undetected. Uses the same Ajv2020 + strict:false
 * config @x402/extensions' own bazaar validator uses (see
 * node_modules/@x402/extensions/dist/cjs/bazaar/index.js), so a failure
 * here means the schema itself is malformed — not the separate, known,
 * non-fatal Cloudflare-Workers-only "Code generation from strings
 * disallowed" restriction documented in
 * packages/pdc-x402-adapter/src/bazaarAjvWorkersLogFilter.ts, which only
 * manifests in workerd and cannot reproduce under Node/vitest (`new
 * Function()` is unrestricted here) — that's expected and is exactly why
 * this test exists as a separate, narrower guarantee: "the schema itself
 * compiles" rather than "the schema compiles inside Cloudflare Workers."
 */
describe("routeSchemas: bazaar discovery schemas", () => {
  for (const route of paidRoutes) {
    it(`${route.method} ${route.path} discovery.schema compiles with ajv.compile()`, () => {
      const ajv = new Ajv2020({ strict: false, allErrors: true });
      expect(() => ajv.compile(route.discovery!.schema)).not.toThrow();
    });
  }

  it("no two routes declare the same discovery.schema $id", () => {
    const idsByRoute = new Map<string, string[]>();
    for (const route of paidRoutes) {
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
