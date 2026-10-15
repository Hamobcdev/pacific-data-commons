import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { samoaComplianceStatusRoute } from "./samoa-compliance-status.js";
import { errorHandler, notFoundHandler } from "../../middleware/errorHandler.js";
import type { AppBindings } from "../../types.js";
import type { Env } from "../../lib/env.js";

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });

  app.route("/", samoaComplianceStatusRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /pacific/samoa-compliance-status", () => {
  it("returns 200 with correct headers", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-compliance-status");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=86400, stale-while-revalidate=604800",
    );
    expect(res.headers.get("x-competition-tag")).toBe("x402-global-challenge");
  });

  it("returns Samoa ISO code WS nested under compliance_status", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-compliance-status");
    const body = (await res.json()) as {
      compliance_status: {
        jurisdiction: string;
        iso_code: string;
        as_of: string;
      };
      summary: string;
      attribution: { source: string };
    };

    expect(body.compliance_status.iso_code).toBe("WS");
    expect(body.compliance_status.jurisdiction).toContain("Samoa");
    expect(typeof body.compliance_status.as_of).toBe("string");
    expect(typeof body.summary).toBe("string");
  });

  it("reflects Samoa removal from EU blacklist on 2026-02-17", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-compliance-status");
    const body = (await res.json()) as {
      compliance_status: {
        eu_blacklist: {
          status: string;
          removed_from_list_date: string;
          legislative_reforms_cited: string[];
          source_url: string;
        };
      };
    };

    expect(body.compliance_status.eu_blacklist.status).toBe("not_listed");
    expect(body.compliance_status.eu_blacklist.removed_from_list_date).toBe("2026-02-17");
    expect(Array.isArray(body.compliance_status.eu_blacklist.legislative_reforms_cited)).toBe(true);
    expect(body.compliance_status.eu_blacklist.legislative_reforms_cited.length).toBeGreaterThan(0);
    expect(typeof body.compliance_status.eu_blacklist.source_url).toBe("string");
  });

  it("reflects FATF compliance status under fatf_status key", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-compliance-status");
    const body = (await res.json()) as {
      compliance_status: {
        fatf_status: {
          status: string;
          last_mutual_evaluation: string;
          notes: string;
        };
        aml_cft_framework: {
          apc_member: boolean;
        };
      };
    };

    expect(typeof body.compliance_status.fatf_status.status).toBe("string");
    expect(typeof body.compliance_status.fatf_status.last_mutual_evaluation).toBe("string");
    // Samoa is an APG (Asia Pacific Group) member — the Pacific equivalent
    expect(body.compliance_status.aml_cft_framework.apc_member).toBe(true);
  });

  it("marks OECD peer review rating as pending_verification, not asserted as fact", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-compliance-status");
    const body = (await res.json()) as {
      compliance_status: {
        oecd_peer_review: {
          status: string;
          note: string;
          source_url: string;
          data_verified_date: string | null;
        };
      };
    };

    // oecd.org blocks automated access (403) — the rating is not yet
    // independently confirmed, so the endpoint must not assert one.
    expect(body.compliance_status.oecd_peer_review.status).toBe("pending_verification");
    expect(typeof body.compliance_status.oecd_peer_review.note).toBe("string");
    expect(typeof body.compliance_status.oecd_peer_review.source_url).toBe("string");
    expect(body.compliance_status.oecd_peer_review.data_verified_date).toBeNull();
  });

  it("has a due_diligence_signal field under compliance_status", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-compliance-status");
    const body = (await res.json()) as {
      compliance_status: {
        due_diligence_signal: string;
      };
    };

    expect(["low_risk", "medium_risk", "high_risk"]).toContain(
      body.compliance_status.due_diligence_signal,
    );
  });

  it("includes attribution with SIFA reference", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-compliance-status");
    const body = (await res.json()) as {
      attribution: { source: string; legislative_bases: string[] };
    };

    expect(body.attribution.source).toContain("SIFA");
    expect(Array.isArray(body.attribution.legislative_bases)).toBe(true);
  });
});
