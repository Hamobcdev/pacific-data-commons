/**
 * Guards against the class of bug where a route file is imported in app.ts
 * but never registered with app.route(). Every named *Route import must
 * appear in the registered routes list.
 *
 * If this test fails after adding a new route: add app.route("/", yourNewRoute)
 * to the registration block in app.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("route registration completeness", () => {
  it("every imported *Route is registered with app.route()", () => {
    const appTs = readFileSync(
      resolve(__dirname, "../app.ts"),
      "utf-8"
    );

    // Find all imported route names (e.g. pacificCryptoRatesRoute)
    const importedRoutes = [...appTs.matchAll(/import \{ (\w+Route) \}/g)].map(
      (m) => m[1]
    );

    // Find all registered route names
    const registeredRoutes = [...appTs.matchAll(/app\.route\("\/",\s*(\w+Route)\)/g)].map(
      (m) => m[1]
    );

    const unregistered = importedRoutes.filter(
      (r) => !registeredRoutes.includes(r)
    );

    expect(unregistered).toEqual([]);
  });
});
