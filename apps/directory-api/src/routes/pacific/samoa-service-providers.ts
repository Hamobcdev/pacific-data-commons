import { Hono } from "hono";
import { getServiceProviders } from "../../services/samoaSifaService.js";
import type { AppBindings } from "../../types.js";

/**
 * GET /pacific/samoa-service-providers
 *
 * Returns the directory of all SIFA-licensed trustee companies in Samoa —
 * the 10 licensed registered agents without whom no Samoa international
 * company, trust, or foundation can be formed.
 *
 * Includes name, address, phone (where available), website (where
 * available), and area of specialisation for each provider. Every
 * provider is listed neutrally, in the register's own source order —
 * no provider receives special placement or commentary.
 *
 * Decision 63 — Samoa Jurisdiction Intelligence (SBP-curated regulatory
 * intelligence, not a Decision 60 open-data wrapper). Priced at $1.50 USDC.
 */
export const samoaServiceProvidersRoute = new Hono<AppBindings>();

samoaServiceProvidersRoute.get("/pacific/samoa-service-providers", async (c) => {
  const result = getServiceProviders();

  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "SIFA Samoa - licensed trustee company register");
  c.header("X-Competition-Tag", "x402-global-challenge");
  return c.json(result);
});
