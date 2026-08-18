import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runHealthCheck } from "../services/healthCheckService.js";
import { createFakeSupabase, getFakeUpdates } from "./testUtils.js";

const ENDPOINT_A = { id: "end-a", title: "Endpoint A", health_check_url: "https://a.example.com/health", consecutive_health_fails: 0 };
const ENDPOINT_B = { id: "end-b", title: "Endpoint B", health_check_url: "https://a.example.com/health", consecutive_health_fails: 2 };
const ENDPOINT_NO_URL = { id: "end-c", title: "Endpoint C", health_check_url: null, consecutive_health_fails: 0 };

describe("runHealthCheck", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks endpoints healthy on a 200 response and resets consecutive_health_fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const supabase = createFakeSupabase({ endpoints: { data: [ENDPOINT_A, ENDPOINT_B] } });
    const summary = await runHealthCheck(supabase);

    expect(summary.checked).toBe(2);
    expect(summary.healthy).toBe(2);
    expect(summary.unhealthy).toBe(0);

    const updates = getFakeUpdates(supabase);
    expect(updates).toHaveLength(2);
    for (const u of updates) {
      expect((u.row as Record<string, unknown>).health_status).toBe("healthy");
      expect((u.row as Record<string, unknown>).consecutive_health_fails).toBe(0);
    }
  });

  it("marks endpoints unhealthy and increments consecutive_health_fails on a non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const supabase = createFakeSupabase({ endpoints: { data: [ENDPOINT_B] } });
    const summary = await runHealthCheck(supabase);

    expect(summary.unhealthy).toBe(1);
    const updates = getFakeUpdates(supabase);
    expect((updates[0]?.row as Record<string, unknown>).health_status).toBe("unhealthy");
    expect((updates[0]?.row as Record<string, unknown>).consecutive_health_fails).toBe(3);
  });

  it("marks unhealthy on a network error / timeout without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );
    const supabase = createFakeSupabase({ endpoints: { data: [ENDPOINT_A] } });
    const summary = await runHealthCheck(supabase);

    expect(summary.unhealthy).toBe(1);
    expect(summary.results[0]?.health_status).toBe("unhealthy");
  });

  it("dedupes a health_check_url shared by multiple endpoint rows to one HTTP request", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const supabase = createFakeSupabase({ endpoints: { data: [ENDPOINT_A, ENDPOINT_B] } });
    await runHealthCheck(supabase);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips endpoints with no health_check_url rather than failing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const supabase = createFakeSupabase({ endpoints: { data: [ENDPOINT_A, ENDPOINT_NO_URL] } });
    const summary = await runHealthCheck(supabase);

    expect(summary.checked).toBe(1);
    expect(summary.skipped_no_url).toBe(1);
  });

  it("returns an empty summary rather than throwing when the endpoints query fails", async () => {
    const supabase = createFakeSupabase({ endpoints: { data: null, error: { message: "db down" } } });
    const summary = await runHealthCheck(supabase);
    expect(summary).toEqual({ checked: 0, healthy: 0, unhealthy: 0, skipped_no_url: 0, results: [] });
  });
});
