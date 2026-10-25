import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { tourismWeddingsRoute } from "../routes/tourism/tourism-weddings.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { createFakeSupabase } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const FIJI_DESTINATION = { nation_code: "FJ", nation_name: "Fiji" };

const FIJI_WEDDING_REQUIREMENTS = {
  nation_code: "FJ",
  residency_waiting_days: 0,
  documents_required: ["passports", "Certificate of Single Status", "2 witnesses with valid photo ID"],
  application_lead_time_weeks: 1,
  legally_binding_available: true,
  legally_binding_notes: "Special Marriage Licence, valid 28 days from issue.",
  symbolic_only_available: true,
  beach_permit_required: false,
  same_sex_marriage_legal: null,
  data_confidence: "curated_unverified",
  data_source: "intelligence report §1.20",
  last_verified: "2026-10-26",
};

const FIJI_WEDDING_VENUE = {
  property_name: "Shangri-La Yanuca Island",
  property_type: "resort",
  wedding_ceremony_types: ["legally_binding", "traditional", "beach"],
  wedding_beach_permit_held: true,
  wedding_traditional_elements: ["kava_ceremony", "meke_performance"],
  wedding_honeymoon_packages: true,
  wedding_vow_renewal_available: true,
  wedding_planner_inhouse: true,
  price_luxury_min_usd: 450,
  price_luxury_max_usd: 1200,
  distance_to_airport_km: 24.5,
  data_confidence: "curated_unverified",
};

function buildTestApp(supabase: ReturnType<typeof createFakeSupabase>) {
  const app = new Hono<AppBindings>();
  const env = {} as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("supabase", supabase);
    await next();
  });

  app.route("/", tourismWeddingsRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /tourism/weddings/:nation_code", () => {
  it("returns 200 with correct shape for FJ (documented wedding tourism)", async () => {
    const supabase = createFakeSupabase({
      tourism_destinations: { data: [FIJI_DESTINATION] },
      tourism_weddings: { data: [FIJI_WEDDING_REQUIREMENTS] },
      tourism_accommodations: { data: [FIJI_WEDDING_VENUE] },
    });
    const app = buildTestApp(supabase);

    const res = await app.request("/tourism/weddings/FJ");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      data: {
        wedding_requirements: Record<string, unknown> | null;
        wedding_venues: unknown[];
        legal_data_warning: string;
        wedding_data_status?: string;
      };
      meta: {
        endpoint: string;
        nation_code: string;
        price_usdc: number;
        data_confidence: string | null;
        last_verified: string | null;
        timestamp: string;
      };
    };

    expect(body.success).toBe(true);
    expect(body.data.wedding_requirements).toMatchObject({ nation_code: "FJ", legally_binding_available: true });
    expect(body.data.wedding_venues).toHaveLength(1);
    expect(body.data.wedding_venues[0]).toMatchObject({ property_name: "Shangri-La Yanuca Island" });
    expect(body.data.legal_data_warning).toContain("curated_unverified");
    expect(body.data.wedding_data_status).toBeUndefined();

    expect(body.meta.endpoint).toBe("/tourism/weddings/{nation_code}");
    expect(body.meta.nation_code).toBe("FJ");
    expect(body.meta.price_usdc).toBe(0.25);
    expect(body.meta.data_confidence).toBe("curated_unverified");
    expect(body.meta.last_verified).toBe("2026-10-26");
    expect(() => new Date(body.meta.timestamp).toISOString()).not.toThrow();
  });

  it("returns 404 for an invalid nation_code not in tourism_destinations", async () => {
    const supabase = createFakeSupabase({
      tourism_destinations: { data: [] },
      tourism_weddings: { data: [] },
      tourism_accommodations: { data: [] },
    });
    const app = buildTestApp(supabase);

    const res = await app.request("/tourism/weddings/XX");
    expect(res.status).toBe(404);
  });
});
