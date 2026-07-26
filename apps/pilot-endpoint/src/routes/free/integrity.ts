import { Hono } from "hono";
import { FISHERIES_RECORDS } from "../../data/fisheries.js";
import type { AppBindings } from "../../types.js";

export const integrityRoute = new Hono<AppBindings>();

/** The critical buyer-verification route: returns the current dataset hash
 * so a buyer can independently recompute it from /full's data array and
 * confirm they received exactly the certified dataset. */
integrityRoute.get("/integrity", (c) => {
  return c.json({
    hash: c.get("datasetHash"),
    algorithm: "sha256",
    canonical_rule: "JSON keys sorted alphabetically, no whitespace, UTF-8 encoding",
    records_count: FISHERIES_RECORDS.length,
    computed_at: c.get("hashComputedAt"),
    verify_instructions:
      "Compute SHA-256 of the /full response data array with keys sorted alphabetically and no whitespace. Compare to this hash.",
  });
});
