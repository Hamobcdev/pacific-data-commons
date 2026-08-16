import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Session 19 fix (CLAUDE.md §26.5 "BUG 2") — a provider with at least one
 * active endpoint must always resume straight to the dashboard, bypassing
 * both the verification_queue check and the onboarding-step walk below it.
 * Previously an already-live provider whose verification_queue row had
 * since been cleared (the normal lifecycle) could fall all the way through
 * to an early onboarding step (e.g. "wallet") on a routine return visit —
 * see resume-session.ts's doc comment for the full root cause.
 *
 * Mocks next/headers (cookies()/headers() throw outside a real request) and
 * both Supabase clients this module uses — the anon cookie client (only for
 * auth.getUser()) and the service client (every table read below), via a
 * minimal per-table fake rather than the full chainable builder other test
 * suites use, since resume-session.ts's queries are all simple
 * select/eq/eq/maybeSingle or select/eq/limit/maybeSingle chains.
 */

const mockGetUser = vi.fn();

interface TableConfig {
  data?: Record<string, unknown> | Record<string, unknown>[] | null;
}

function fakeServiceClient(tables: Record<string, TableConfig>) {
  return {
    from: (table: string) => {
      const config = tables[table] ?? { data: null };
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: Array.isArray(config.data) ? (config.data[0] ?? null) : config.data, error: null }),
      };
      return chain;
    },
  };
}

vi.mock("next/headers", () => ({
  headers: () => ({ get: () => null }),
  cookies: () => ({ getAll: () => [], set: () => {} }),
}));

let serviceClient: ReturnType<typeof fakeServiceClient>;

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => serviceClient,
}));

vi.mock("@/lib/onboarding/session", () => ({
  createOnboardingSession: async () => "session-token",
}));

describe("resumeOnboardingSession — active-endpoint dashboard bypass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { email: "provider@usp.ac.fj" } } });
  });

  it("returns redirectToDashboard when the provider has an active endpoint, even with no verification_queue row and no endpoint_deployments row", async () => {
    serviceClient = fakeServiceClient({
      providers: { data: { id: "prov-1", wallet_verified_at: null, provenance_declaration: null } },
      endpoints: { data: { id: "end-1" } },
      verification_queue: { data: null },
      endpoint_deployments: { data: null },
      formatting_runs: { data: null },
    });

    const { resumeOnboardingSession } = await import("../actions/onboarding/resume-session");
    const result = await resumeOnboardingSession();

    expect(result).toEqual({ success: true, providerId: "prov-1", redirectToDashboard: true });
  });

  it("still walks onboarding steps for a provider with no active endpoint and no queue entry (genuinely mid-onboarding)", async () => {
    serviceClient = fakeServiceClient({
      providers: { data: { id: "prov-2", wallet_verified_at: "2026-08-01T00:00:00Z", provenance_declaration: null } },
      endpoints: { data: null },
      verification_queue: { data: null },
      endpoint_deployments: { data: null },
      formatting_runs: { data: null },
    });

    const { resumeOnboardingSession } = await import("../actions/onboarding/resume-session");
    const result = await resumeOnboardingSession();

    expect(result.redirectToDashboard).toBeUndefined();
    expect(result.nextStep).toBe("upload");
  });

  it("still redirects to dashboard via the pre-existing verification_queue check when there is no active endpoint yet", async () => {
    serviceClient = fakeServiceClient({
      providers: { data: { id: "prov-3", wallet_verified_at: null, provenance_declaration: null } },
      endpoints: { data: null },
      verification_queue: { data: { id: "queue-1" } },
    });

    const { resumeOnboardingSession } = await import("../actions/onboarding/resume-session");
    const result = await resumeOnboardingSession();

    expect(result).toEqual({ success: true, providerId: "prov-3", redirectToDashboard: true });
  });
});
