import { describe, expect, it } from "vitest";
import { parseSearchFilters, searchEndpoints } from "../services/searchService.js";
import { AppError } from "../lib/errors.js";
import { createFakeSupabase } from "./testUtils.js";

describe("parseSearchFilters", () => {
  it("applies defaults when no query params are given", () => {
    const filters = parseSearchFilters(new URLSearchParams());
    expect(filters).toMatchObject({ page: 1, limit: 20 });
  });

  it("parses and clamps page/limit", () => {
    const filters = parseSearchFilters(new URLSearchParams("page=0&limit=1000"));
    expect(filters.page).toBe(1);
    expect(filters.limit).toBe(100);
  });

  it("rejects an unknown category", () => {
    expect(() => parseSearchFilters(new URLSearchParams("category=astrology"))).toThrow(AppError);
  });

  it("rejects an unknown trust_tier", () => {
    expect(() => parseSearchFilters(new URLSearchParams("trust_tier=platinum"))).toThrow(AppError);
  });

  it("rejects a negative price_max", () => {
    expect(() => parseSearchFilters(new URLSearchParams("price_max=-1"))).toThrow(AppError);
  });

  it("passes through valid filters", () => {
    const filters = parseSearchFilters(
      new URLSearchParams("category=fisheries&country=fiji&trust_tier=gold&price_max=5&keywords=tuna"),
    );
    expect(filters).toMatchObject({
      category: "fisheries",
      country: "fiji",
      trustTier: "gold",
      priceMax: 5,
      keywords: "tuna",
    });
  });
});

describe("searchEndpoints", () => {
  it("maps joined provider+endpoint rows into public search results", async () => {
    const supabase = createFakeSupabase({
      endpoints: {
        data: [
          {
            id: "end-1",
            provider_id: "prov-1",
            data_category: "fisheries",
            title: "Tuna Stock",
            description: "desc",
            pricing_tiers: [{ tier: 1, price_usdc: 0.01 }],
            max_tier_at_bronze: 2,
            indigenous_data_flag: false,
            cultural_sensitivity: "none",
            attribution_required: true,
            commercial_licence_req: false,
            health_status: "healthy",
            total_queries: 3,
            is_active: true,
            providers: {
              id: "prov-1",
              institution_name: "USP",
              institution_type: "university",
              country: "Fiji",
              trust_tier: "silver",
              verified_government: false,
              is_active: true,
              total_queries_served: 3,
            },
          },
        ],
        count: 1,
      },
    });

    const result = await searchEndpoints(supabase, {
      page: 1,
      limit: 20,
    });

    expect(result.totalCount).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.endpoint.id).toBe("end-1");
    expect(result.results[0]?.provider.id).toBe("prov-1");
  });

  it("filters out endpoints with no tier under price_max", async () => {
    const supabase = createFakeSupabase({
      endpoints: {
        data: [
          {
            id: "end-expensive",
            provider_id: "prov-1",
            data_category: "fisheries",
            title: "Expensive dataset",
            description: "desc",
            pricing_tiers: [{ tier: 3, price_usdc: 25 }],
            max_tier_at_bronze: 2,
            is_active: true,
            providers: { id: "prov-1", is_active: true, trust_tier: "bronze" },
          },
        ],
        count: 1,
      },
    });

    const result = await searchEndpoints(supabase, { page: 1, limit: 20, priceMax: 1 });
    expect(result.results).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("surfaces a database error as a 502 AppError", async () => {
    const supabase = createFakeSupabase({
      endpoints: { data: null, error: { message: "connection refused" } },
    });

    await expect(searchEndpoints(supabase, { page: 1, limit: 20 })).rejects.toThrow(AppError);
  });
});
