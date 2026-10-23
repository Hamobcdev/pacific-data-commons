import { Hono } from "hono";
import { getRegisteredAgents } from "../../services/vanuatuJurisdictionService.js";
import type { AppBindings } from "../../types.js";

/**
 * GET /pacific/vanuatu-registered-agents
 *
 * Returns the directory of VFSC-licensed Company and Trust Service
 * Providers in Vanuatu — the registered agents without whom no Vanuatu
 * International Company can be formed.
 *
 * Vanuatu Jurisdiction Intelligence (SBP-curated regulatory intelligence,
 * not a Decision 60 open-data wrapper). Priced at $0.60 USDC per
 * PDC-POL-2026-001.
 */
export const vanuatuRegisteredAgentsRoute = new Hono<AppBindings>();

vanuatuRegisteredAgentsRoute.get("/pacific/vanuatu-registered-agents", async (c) => {
  const result = getRegisteredAgents();

  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "VFSC live directory - licensed CTSP register");
  c.header("X-Competition-Tag", "x402-global-challenge");
  return c.json(result);
});
