import { Hono } from "hono";
import { generatePacificTravelBrief, AllTourismSubEndpointsFailedError } from "../../services/pacificTourismService.js";
import { AppError, ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in index.ts (priceUsdc registered separately from this
// handler — same posture as pacificBriefRoute, fxRoute, walletBalanceRoute).
export const pacificTravelRoute = new Hono<AppBindings>();

const VALID_DESTINATIONS = new Set(["WS", "FJ", "TO", "PG", "SB", "VU", "CK"]);
const VALID_TRAVEL_WINDOWS = new Set(["next_30_days", "next_90_days", "christmas_2026", "school_holidays"]);

pacificTravelRoute.get("/intelligence/pacific-travel", async (c) => {
  const destination = c.req.query("destination")?.toUpperCase();
  const travelWindow = c.req.query("travel_window")?.toLowerCase() ?? "next_90_days";

  if (!destination) {
    throw new ValidationError("destination is required, e.g. ?destination=WS");
  }
  if (!VALID_DESTINATIONS.has(destination)) {
    throw new ValidationError(`destination must be a Pacific ISO code: ${Array.from(VALID_DESTINATIONS).join(", ")}`);
  }
  if (!VALID_TRAVEL_WINDOWS.has(travelWindow)) {
    throw new ValidationError(`travel_window must be one of: ${Array.from(VALID_TRAVEL_WINDOWS).join(", ")}`);
  }

  const env = c.get("env");
  const supabase = c.get("supabase");

  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError(503, "service_unavailable", "Travel intelligence synthesis service is not configured.");
  }
  if (!env.AGENT_WALLET_KEY) {
    throw new AppError(503, "service_unavailable", "Orchestrator payment wallet is not configured.");
  }

  try {
    const brief = await generatePacificTravelBrief({
      destination,
      travelWindow,
      supabase,
      agentWalletKey: env.AGENT_WALLET_KEY,
      network: env.ALGORAND_NETWORK,
      pilotEndpointUrl: env.PILOT_ENDPOINT_URL,
      publicUrl: env.PUBLIC_URL,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      claudeModel: env.CLAUDE_MODEL,
    });
    return c.json(brief);
  } catch (err) {
    if (err instanceof AllTourismSubEndpointsFailedError) {
      throw new AppError(503, "endpoints_unavailable", "Pacific data endpoints are temporarily unavailable. Try again shortly.");
    }
    throw err;
  }
});
