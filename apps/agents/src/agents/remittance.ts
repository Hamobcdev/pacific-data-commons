import { z } from "zod";
import type { AgentType, DataCategory } from "@pdc/shared-types";
import { BaseAgent } from "./base.js";

const inputSchema = z.object({
  sending_country: z.string().min(2),
  receiving_country: z.string().min(2),
  amount_usd: z.string().optional(),
});

export class RemittanceNavigatorAgent extends BaseAgent {
  agentType: AgentType = "remittance_navigator";
  requiredCategories: DataCategory[] = ["remittance", "demographics"];
  inputSchema = inputSchema;

  synthesisPrompt(data: Record<string, unknown>[], parameters: Record<string, string | undefined>): string {
    return `You are a Pacific remittance corridor analyst.

Sending: ${parameters.sending_country}
Receiving: ${parameters.receiving_country}
${parameters.amount_usd ? `Amount: USD ${parameters.amount_usd}` : ""}

Remittance corridor data: ${JSON.stringify(data)}

Provide:
1. Current corridor volume trend (is remittance to this country growing?)
2. Seasonal patterns (are there months with significantly higher flows?)
3. Economic significance (remittance as % of GDP if available in data)
4. Practical context for someone sending money on this corridor

Format as JSON: volume_trend, seasonal_peak (month or null),
gdp_percentage (number or null), practical_context (string).`;
  }
}
