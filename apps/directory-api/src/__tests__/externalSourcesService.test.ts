import { describe, expect, it } from "vitest";
import { listActiveExternalSources } from "../services/externalSourcesService.js";
import { AppError } from "../lib/errors.js";
import { createFakeSupabase } from "./testUtils.js";

describe("listActiveExternalSources", () => {
  it("returns active sources with price_usdc coerced to a number", async () => {
    const supabase = createFakeSupabase({
      approved_external_sources: {
        data: [
          {
            id: "src-1",
            name: "Global SST Feed",
            description: "Sea surface temperature",
            data_category: "ocean",
            price_usdc: "0.02",
            provider_name: "External Org",
            provider_url: "https://external.example",
            geographic_scope: "global",
          },
        ],
      },
    });

    const sources = await listActiveExternalSources(supabase);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ id: "src-1", price_usdc: 0.02 });
    expect(typeof sources[0]?.price_usdc).toBe("number");
  });

  it("returns an empty array when there are no active sources", async () => {
    const supabase = createFakeSupabase({ approved_external_sources: { data: [] } });
    const sources = await listActiveExternalSources(supabase);
    expect(sources).toEqual([]);
  });

  it("throws an AppError on a database error rather than returning a partial result", async () => {
    const supabase = createFakeSupabase({
      approved_external_sources: { data: null, error: { message: "connection failed" } },
    });
    await expect(listActiveExternalSources(supabase)).rejects.toThrow(AppError);
  });
});
