"use server";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { PacificTravelBrief } from "@/lib/demo/types";

export type TourismBriefResult =
  | { success: true; brief: PacificTravelBrief }
  | { success: false; code: "rate_limited" | "invalid_request" | "unavailable"; message: string };

/**
 * Session 33 — calls directory-api's POST /internal/tourism-demo, which in
 * turn runs the real Pacific Tourism Orchestrator (Session 32) and makes 3
 * real x402 sub-payments from SBP's own agent wallet. The demo page has no
 * wallet connection and collects no payment from the visitor — that
 * imbalance (public page, unauthenticated, real Mainnet USDC spend per
 * click) is exactly why this is rate-limited far tighter than
 * verify-doi.ts's 10/hour (which costs SBP nothing): 5 requests/hour/IP is
 * enough for a live STA demo walkthrough of a few destinations without
 * leaving the endpoint open to being drained by a bot or a refresh loop.
 * Never throws — always returns a result object, same posture as
 * verify-doi.ts and dry-run-agent.ts.
 */
export async function generateTourismDemoBrief(destination: string, travelWindow: string): Promise<TourismBriefResult> {
  const ip = await getClientIp();
  const rateLimit = checkRateLimit({ identifier: `tourism-demo:${ip}`, maxRequests: 5, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return { success: false, code: "rate_limited", message: "Too many requests. Please try again shortly." };
  }

  const directoryApiUrl = process.env.DIRECTORY_API_URL;
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!directoryApiUrl || !internalApiKey) {
    return { success: false, code: "unavailable", message: "Demo service is not configured." };
  }

  try {
    const res = await fetch(`${directoryApiUrl.replace(/\/$/, "")}/internal/tourism-demo`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-key": internalApiKey },
      body: JSON.stringify({ destination, travel_window: travelWindow }),
    });

    if (res.status === 400) {
      return { success: false, code: "invalid_request", message: "Invalid destination or travel window." };
    }
    if (!res.ok) {
      return { success: false, code: "unavailable", message: "Unable to generate brief at this time." };
    }

    const brief = (await res.json()) as PacificTravelBrief;
    return { success: true, brief };
  } catch (err) {
    console.error("[generateTourismDemoBrief] request failed", err instanceof Error ? err.message : String(err));
    return { success: false, code: "unavailable", message: "Unable to generate brief at this time." };
  }
}
