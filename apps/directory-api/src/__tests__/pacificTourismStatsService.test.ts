import { describe, expect, it } from "vitest";
import { getTourismStats } from "../services/pacificTourismStatsService.js";
import { AppError } from "../lib/errors.js";
import { createFakeSupabase } from "./testUtils.js";

const statsRow = {
  country_code: "WS",
  country_name: "Samoa",
  year: 2023,
  international_arrivals: 164000,
  tourism_receipts_usd_millions: 180.5,
  avg_spend_per_visitor_usd: 1100,
  avg_length_stay_days: 8.5,
  peak_months: ["December", "January"],
  low_months: ["March"],
  source: "World Bank / Samoa Tourism Authority",
  data_quality: "verified",
};

describe("getTourismStats", () => {
  it("returns the stats row for a country that has one", async () => {
    const supabase = createFakeSupabase({ pacific_tourism_stats: { data: [statsRow] } });
    const result = await getTourismStats(supabase, "WS");
    expect(result).toEqual(statsRow);
  });

  it("returns null (never throws) when no row exists for the country", async () => {
    const supabase = createFakeSupabase({ pacific_tourism_stats: { data: [] } });
    const result = await getTourismStats(supabase, "SB");
    expect(result).toBeNull();
  });

  it("throws AppError on a database error", async () => {
    const supabase = createFakeSupabase({ pacific_tourism_stats: { error: { message: "connection failed" } } });
    await expect(getTourismStats(supabase, "WS")).rejects.toThrow(AppError);
  });
});
