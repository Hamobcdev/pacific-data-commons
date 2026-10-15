import { Hono } from "hono";
import { getBankingSetup } from "../../services/samoaSifaService.js";
import type { AppBindings } from "../../types.js";

/**
 * GET /pacific/samoa-banking-setup
 *
 * Returns structured requirements for obtaining a Samoa International
 * Banking Licence under the International Banking Act 2005 — including
 * capital requirements, director qualifications, AML/CFT programme
 * requirements, application process steps with timeline estimates,
 * annual obligations, and permitted vs restricted activities.
 *
 * Includes a specific note on CBS consultation requirements for any
 * USDC or digital asset banking activities.
 *
 * Decision 63 — Samoa Jurisdiction Intelligence (SBP-curated regulatory
 * intelligence, not a Decision 60 open-data wrapper). Priced at $5.00 USDC.
 */
export const samoaBankingSetupRoute = new Hono<AppBindings>();

samoaBankingSetupRoute.get("/pacific/samoa-banking-setup", async (c) => {
  const result = getBankingSetup();

  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "SIFA Samoa - International Banking Act 2005");
  c.header("X-Competition-Tag", "x402-global-challenge");
  return c.json(result);
});
