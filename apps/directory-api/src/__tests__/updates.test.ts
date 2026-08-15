import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { updatesRoute } from "../routes/updates.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { createFakeSupabase } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

/** Same pattern as freeRoutes.test.ts — GET /endpoints/:id/versions is
 * public, no payment gate, no auth. */
function buildTestApp(supabase: ReturnType<typeof createFakeSupabase>) {
  const app = new Hono<AppBindings>();
  const env = { ALGORAND_NETWORK: "testnet" } as Env;

  app.use("*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("env", env);
    await next();
  });

  app.route("/", updatesRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /endpoints/:endpointId/versions", () => {
  const endpointId = randomUUID();

  it("400s on a malformed endpoint id", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/endpoints/not-a-uuid/versions");
    expect(res.status).toBe(400);
  });

  it("404s when the endpoint doesn't exist", async () => {
    const app = buildTestApp(createFakeSupabase({ endpoints: { data: [] } }));
    const res = await app.request(`/endpoints/${endpointId}/versions`);
    expect(res.status).toBe(404);
  });

  it("returns the current version and full history in reverse chronological order", async () => {
    const app = buildTestApp(
      createFakeSupabase({
        endpoints: { data: [{ id: endpointId, version_number: 2 }] },
        endpoint_versions: {
          data: [
            {
              version_number: 2,
              update_category: "additive",
              provider_change_description: "Added Q2 2026 records.",
              records_added: 847,
              records_modified: 0,
              records_removed: 0,
              new_parameters: null,
              date_range_extended: true,
              certified_at: "2026-08-12T00:00:00.000Z",
              recertification_required: false,
              algorand_tx_id: "TX2",
              declared_at: "2026-08-10T00:00:00.000Z",
            },
            {
              version_number: 1,
              update_category: "initial_certification",
              provider_change_description: "Initial dataset.",
              records_added: 18,
              records_modified: 0,
              records_removed: 0,
              new_parameters: null,
              date_range_extended: false,
              certified_at: "2026-08-03T00:00:00.000Z",
              recertification_required: false,
              algorand_tx_id: "TX1",
              declared_at: "2026-08-03T00:00:00.000Z",
            },
          ],
        },
      }),
    );

    const res = await app.request(`/endpoints/${endpointId}/versions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { endpoint_id: string; current_version: number; versions: Array<{ version_number: number }> };
    expect(body.endpoint_id).toBe(endpointId);
    expect(body.current_version).toBe(2);
    expect(body.versions).toHaveLength(2);
    expect(body.versions[0]?.version_number).toBe(2);
    expect(body.versions[1]?.version_number).toBe(1);
  });

  it("returns an empty versions array for an endpoint with no declared updates yet", async () => {
    const app = buildTestApp(
      createFakeSupabase({
        endpoints: { data: [{ id: endpointId, version_number: 1 }] },
        endpoint_versions: { data: [] },
      }),
    );

    const res = await app.request(`/endpoints/${endpointId}/versions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { current_version: number; versions: unknown[] };
    expect(body.current_version).toBe(1);
    expect(body.versions).toEqual([]);
  });
});
