import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { pacificEventsRoute } from "../routes/pacific/events.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { createFakeSupabase } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const TEUILA_EVENT = {
  id: "evt-1",
  name: "Teuila Tourism Festival",
  description: "Samoa's premier annual tourism and cultural festival.",
  category: "festival",
  subcategory: "cultural",
  country_code: "WS",
  country_name: "Samoa",
  city: "Apia",
  start_date: "2026-09-01",
  end_date: "2026-09-05",
  expected_attendance: 50000,
  tourism_impact: "very_high",
  international_visitors: true,
  diaspora_draw: true,
  highlights: ["Traditional fiafia nights"],
  travel_tips: "Book at least 2 months ahead.",
  booking_lead_time: "2 months ahead",
  source: "Samoa Tourism Authority",
  data_quality: "verified",
};

function buildTestApp(supabase = createFakeSupabase({ pacific_events: { data: [TEUILA_EVENT] } })) {
  const app = new Hono<AppBindings>();
  const env = {} as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("supabase", supabase);
    await next();
  });

  app.route("/", pacificEventsRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /pacific/events", () => {
  it("returns upcoming events with no params, correct shape", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/events");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[]; count: number };
    expect(body.count).toBe(1);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ name: "Teuila Tourism Festival", country_code: "WS", category: "festival" });
  });

  it("accepts a valid country filter", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/events?country=WS");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toHaveLength(1);
  });

  it("accepts a valid days_ahead within range", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/events?days_ahead=7");
    expect(res.status).toBe(200);
  });

  it("accepts a valid category filter", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/events?category=festival");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results[0]).toMatchObject({ category: "festival" });
  });

  it("returns 400 for an invalid country", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/events?country=US");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 for days_ahead=0", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/events?days_ahead=0");
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid category", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/events?category=astrology");
    expect(res.status).toBe(400);
  });

  it("returns 200 with an empty results array when no events are in the window", async () => {
    const app = buildTestApp(createFakeSupabase({ pacific_events: { data: [] } }));
    const res = await app.request("/pacific/events");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[]; count: number };
    expect(body.results).toEqual([]);
    expect(body.count).toBe(0);
  });
});
