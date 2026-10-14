import { Hono } from "hono";
import { getServiceProviders } from "../../services/samoaSifaService.js";
import type { AppBindings } from "../../types.js";

/**
 * GET /pacific/samoa-service-providers
 *
 * Returns the directory of all SIFA-licensed trustee companies in Samoa —
 * the 9 licensed registered agents without whom no Samoa international
 * company, trust, or foundation can be formed.
 *
 * Includes name, address, phone (where available), website (where
 * available), and area of specialisation for each provider.
 *
 * Disclosure: Pacific Fiduciaries (Samoa) Limited is listed neutrally
 * in this directory alongside all other SIFA-licensed providers.
 * SBP / Pacific Data Commons has a separate commercial referral
 * relationship with Pacific Fiduciaries — this relationship is
 * disclosed at pdc.synergybcpacific.com/disclosures and does NOT
 * affect the ordering, completeness, or content of this directory.
 *
 * Decision 61 — Pacific Data Registry first-party endpoint.
 * Priced at $0.01 USDC (Decision 60 safe default).
 */
export const samoaServiceProvidersRoute = new Hono<AppBindings>();

samoaServiceProvidersRoute.get("/pacific/samoa-service-providers", async (c) => {
  const result = getServiceProviders();

  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "SIFA Samoa - licensed trustee company register");
  c.header("X-Competition-Tag", "x402-global-challenge");
  return c.json(result);
});
