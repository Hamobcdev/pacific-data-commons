import { Hono } from "hono";
import { getUpcomingEvents, VALID_EVENT_CATEGORIES } from "../../services/pacificEventsService.js";
import { ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in index.ts (priceUsdc registered separately from this
// handler — same posture as fxRoute, walletBalanceRoute, pacificBriefRoute).
//
// Query params:
//   country (optional)    — ISO 3166-1 alpha-2: WS, FJ, TO, PG, SB, VU, CK
//   days_ahead (optional) — integer 1-365, default 90
//   category (optional)   — festival/concert/sport/cultural/religious/political/business/other
export const pacificEventsRoute = new Hono<AppBindings>();

const VALID_COUNTRIES = new Set(["WS", "FJ", "TO", "PG", "SB", "VU", "CK"]);

pacificEventsRoute.get("/pacific/events", async (c) => {
  const countryRaw = c.req.query("country")?.toUpperCase();
  const daysAheadRaw = c.req.query("days_ahead");
  const categoryRaw = c.req.query("category")?.toLowerCase();

  if (countryRaw && !VALID_COUNTRIES.has(countryRaw)) {
    throw new ValidationError(`country must be one of: ${Array.from(VALID_COUNTRIES).join(", ")}`);
  }

  let daysAhead: number | undefined;
  if (daysAheadRaw !== undefined) {
    daysAhead = Number(daysAheadRaw);
    if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 365) {
      throw new ValidationError("days_ahead must be an integer between 1 and 365");
    }
  }

  if (categoryRaw && !VALID_EVENT_CATEGORIES.has(categoryRaw)) {
    throw new ValidationError(`category must be one of: ${Array.from(VALID_EVENT_CATEGORIES).join(", ")}`);
  }

  const supabase = c.get("supabase");
  const results = await getUpcomingEvents(supabase, {
    countryCode: countryRaw,
    daysAhead,
    category: categoryRaw,
  });

  return c.json({ results, count: results.length });
});
