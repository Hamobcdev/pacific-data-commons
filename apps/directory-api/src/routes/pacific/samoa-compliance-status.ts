import { Hono } from "hono";
import { getComplianceStatus } from "../../services/samoaSifaService.js";
import type { AppBindings } from "../../types.js";

/**
 * GET /pacific/samoa-compliance-status
 *
 * Returns Samoa's current regulatory compliance status across EU, FATF,
 * OECD, and TIEA networks — structured for AI due diligence agents.
 *
 * Key data: EU blacklist removal date (17 February 2026), FATF APG
 * membership and mutual evaluation status, OECD peer review rating,
 * TIEA partner network, AML/CFT framework, and SIFA overview.
 *
 * Decision 63 — Samoa Jurisdiction Intelligence (SBP-curated regulatory
 * intelligence, not a Decision 60 open-data wrapper). Priced at $1.00 USDC.
 */
export const samoaComplianceStatusRoute = new Hono<AppBindings>();

samoaComplianceStatusRoute.get("/pacific/samoa-compliance-status", async (c) => {
  const result = getComplianceStatus();

  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "EU Council / FATF / OECD Global Forum / SIFA");
  c.header("X-Competition-Tag", "x402-global-challenge");
  return c.json(result);
});
