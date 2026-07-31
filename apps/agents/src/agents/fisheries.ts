import { z } from "zod";
import type { AgentType, DataCategory } from "@pdc/shared-types";
import { BaseAgent } from "./base.js";
import type { SeasonalDomain } from "../lib/seasonal.js";

const inputSchema = z.object({
  species: z.enum(["skipjack", "yellowfin", "bigeye", "albacore", "all"]),
  zone: z.string().min(2),
  year_range: z.string().optional(),
  purpose: z.enum(["stock_assessment", "licensing_decision", "conservation_review", "commercial_planning"]).optional(),
});

/**
 * R5 — non-negotiable: this agent MUST query both "fisheries" and "ocean"
 * categories and interpret them together. A fisheries agent that skips
 * ocean condition data is scientifically misleading (a catch-volume decline
 * during a La Niña year may reflect distribution shift, not stock decline).
 */
export class FisheriesStatusAgent extends BaseAgent {
  agentType: AgentType = "fisheries_status";
  requiredCategories: DataCategory[] = ["fisheries", "ocean"];
  inputSchema = inputSchema;
  protected seasonalDomain: SeasonalDomain | null = "fisheries";

  protected seasonalGeography(parameters: Record<string, string | undefined>): string {
    return parameters.zone?.toLowerCase().replace(/\s+/g, "_") ?? "pacific_wide";
  }

  synthesisPrompt(data: Record<string, unknown>[], parameters: Record<string, string | undefined>, seasonalContext: string | null): string {
    const fisheriesData = data.filter((d) => d._source === "fisheries");
    const oceanData = data.filter((d) => d._source === "ocean");

    return `You are a Pacific fisheries scientist providing stock
assessment analysis.

Species: ${parameters.species}
Zone: ${parameters.zone}
Purpose: ${parameters.purpose || "general assessment"}

FISHERIES DATA (catch volumes, stock indices):
${JSON.stringify(fisheriesData)}

OCEAN CONDITIONS DATA (temperature, currents, anomalies):
${JSON.stringify(oceanData)}

${seasonalContext ? `Seasonal context: ${seasonalContext}` : ""}

CRITICAL INSTRUCTION: Interpret the fisheries data in the context of
the ocean conditions. A decline in catch volume during a La Niña year
may reflect fish distribution changes, not stock decline. An increase
during warm anomalies may not reflect genuine stock recovery.

Your assessment must include:
1. Stock status (healthy/moderate/depleted) with stock index citation
2. Ocean condition influence on the data interpretation
3. Trend assessment (accounting for environmental factors)
4. Management implication for the stated purpose
5. Data confidence rating

Format as JSON: stock_status, stock_index, ocean_influence (string),
trend, confidence (0-1), management_implication, caveats (array).`;
  }
}
