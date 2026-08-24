import { Hono } from "hono";
import { generatePacificBrief, AllSubEndpointsFailedError } from "../../services/pacificIntelligenceService.js";
import { AppError, ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in index.ts (priceUsdc registered separately from this
// handler — same posture as fxRoute, walletBalanceRoute, search.ts).
export const pacificBriefRoute = new Hono<AppBindings>();

const VALID_TOPICS = new Set(["fisheries", "marine", "ocean", "economic", "climate", "general"]);
const VALID_COUNTRIES = new Set(["WS", "FJ", "TO", "PG", "SB", "VU", "CK", "NU"]);

pacificBriefRoute.get("/intelligence/pacific-brief", async (c) => {
  const topic = c.req.query("topic")?.toLowerCase() ?? "general";
  const country = c.req.query("country")?.toUpperCase() ?? "WS";

  if (!VALID_TOPICS.has(topic)) {
    throw new ValidationError(`topic must be one of: ${Array.from(VALID_TOPICS).join(", ")}`);
  }
  if (!VALID_COUNTRIES.has(country)) {
    throw new ValidationError(`country must be a Pacific ISO code: ${Array.from(VALID_COUNTRIES).join(", ")}`);
  }

  const env = c.get("env");
  const supabase = c.get("supabase");

  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError(503, "service_unavailable", "Intelligence synthesis service is not configured.");
  }
  if (!env.AGENT_WALLET_KEY) {
    throw new AppError(503, "service_unavailable", "Orchestrator payment wallet is not configured.");
  }

  try {
    const brief = await generatePacificBrief({
      topic,
      country,
      supabase,
      agentWalletKey: env.AGENT_WALLET_KEY,
      network: env.ALGORAND_NETWORK,
      pilotEndpointUrl: env.PILOT_ENDPOINT_URL,
      publicUrl: env.PUBLIC_URL,
      avmAddress: env.AVM_ADDRESS,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      claudeModel: env.CLAUDE_MODEL,
    });
    return c.json(brief);
  } catch (err) {
    if (err instanceof AllSubEndpointsFailedError) {
      throw new AppError(503, "endpoints_unavailable", "Pacific data endpoints are temporarily unavailable. Try again shortly.");
    }
    throw err;
  }
});
