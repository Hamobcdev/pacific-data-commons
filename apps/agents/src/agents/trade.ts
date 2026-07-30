import { z } from "zod";
import type { AgentType, DataCategory } from "@pdc/shared-types";
import { BaseAgent } from "./base.js";

const inputSchema = z.object({
  commodity: z.string().min(2),
  country: z.string().min(2),
  time_period: z.string().optional(),
  comparison_countries: z.string().optional(),
});

export class TradeIntelligenceAgent extends BaseAgent {
  agentType: AgentType = "trade_intelligence";
  requiredCategories: DataCategory[] = ["trade", "demographics"];
  inputSchema = inputSchema;

  synthesisPrompt(data: Record<string, unknown>[], parameters: Record<string, string | undefined>, seasonalContext: string | null): string {
    return `You are a Pacific trade intelligence analyst.

Analyse the following verified Pacific trade data and produce a structured
intelligence report for: ${parameters.commodity} in ${parameters.country}.

Data provided: ${JSON.stringify(data)}
${seasonalContext ? `Seasonal context: ${seasonalContext}` : ""}

Your report must include:
1. Current export/import volumes and trends (cite the data)
2. Price movements over the period
3. Key buyer and seller markets
4. ${parameters.comparison_countries ? `Comparison with ${parameters.comparison_countries}` : "Regional market position"}
5. One actionable insight for an exporter or trade ministry

Format as JSON with fields: summary (2 sentences), trends (array),
key_markets (array), comparison (string), actionable_insight (string).
Do not include any data not present in the provided dataset.`;
  }
}
