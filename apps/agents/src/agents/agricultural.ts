import { z } from "zod";
import type { AgentType, DataCategory } from "@pdc/shared-types";
import { BaseAgent } from "./base.js";
import type { SeasonalDomain } from "../lib/seasonal.js";

const inputSchema = z.object({
  crop: z.string().min(2),
  country: z.string().min(2),
  query_type: z.enum(["market_outlook", "planting_advice", "export_options", "price_comparison"]),
});

/**
 * Decision 33 — English only at launch. Primary users are smallholder
 * farmers; output must be plain language. This class does not add Pacific
 * language output via LLM translation — that path is a harm vector (wrong
 * planting advice in fluent Samoan is worse than correct advice in
 * English). Pacific language rollout requires human-reviewed templates,
 * Phase 2+; this agent enforces English by instruction only (R4) since
 * there is no template/glossary system to enforce it structurally yet —
 * flagged at end of session.
 */
export class AgriculturalExportsAgent extends BaseAgent {
  agentType: AgentType = "agricultural_exports";
  requiredCategories: DataCategory[] = ["agriculture", "trade", "climate"];
  inputSchema = inputSchema;
  protected seasonalDomain: SeasonalDomain | null = "agriculture";

  protected seasonalGeography(parameters: Record<string, string | undefined>): string {
    return parameters.country?.toLowerCase().replace(/\s+/g, "_") ?? "pacific_wide";
  }

  synthesisPrompt(data: Record<string, unknown>[], parameters: Record<string, string | undefined>, seasonalContext: string | null): string {
    const tradeData = data.filter((d) => d._source === "trade");
    const agricultureData = data.filter((d) => d._source === "agriculture");
    const climateData = data.filter((d) => d._source === "climate");

    return `You are an agricultural market advisor for Pacific smallholder
farmers and cooperatives. Your output must be plain language that a
farmer with no specialist knowledge can understand and act on immediately.

Crop: ${parameters.crop}
Country: ${parameters.country}
Query type: ${parameters.query_type}

Market data: ${JSON.stringify(tradeData)}
Production data: ${JSON.stringify(agricultureData)}
Climate data: ${JSON.stringify(climateData)}
${seasonalContext ? `Current season: ${seasonalContext}` : ""}

PLAIN LANGUAGE RULES:
- Write as if speaking to a farmer, not an economist
- Use specific numbers from the data ("$X per tonne" not "prices are high")
- Give one clear recommendation
- Mention weather or season only if it affects the advice
- Maximum 4 sentences for the main advice

Format as JSON:
  current_price (string with units),
  main_buyers (array of country names),
  season_note (string or null — only if relevant),
  recommendation (string — plain language, max 2 sentences),
  market_outlook (string — "improving"/"stable"/"declining" with one reason),
  data_period (string — what years the data covers)

NOTE: English only. Do not output in any other language.
Pacific language output requires human-reviewed templates — Phase 2.`;
  }
}
