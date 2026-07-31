import { z } from "zod";
import type { AgentType, DataCategory } from "@pdc/shared-types";
import { BaseAgent } from "./base.js";
import type { SeasonalDomain } from "../lib/seasonal.js";

const inputSchema = z.object({
  location: z.string().min(2),
  risk_type: z.enum(["cyclone", "drought", "sea_level", "coral_bleaching", "flooding", "all"]),
  time_horizon: z.enum(["current", "5_year", "10_year", "20_year"]),
  use_case: z.string().optional(),
});

export class ClimateRiskAgent extends BaseAgent {
  agentType: AgentType = "climate_risk";
  requiredCategories: DataCategory[] = ["climate", "ocean", "disaster_risk"];
  inputSchema = inputSchema;
  protected seasonalDomain: SeasonalDomain | null = "climate";

  protected seasonalGeography(parameters: Record<string, string | undefined>): string {
    return parameters.location?.toLowerCase().replace(/\s+/g, "_") ?? "pacific_wide";
  }

  synthesisPrompt(data: Record<string, unknown>[], parameters: Record<string, string | undefined>, seasonalContext: string | null): string {
    return `You are a Pacific climate risk analyst providing verified
data-based risk assessment.

Location: ${parameters.location}
Risk type: ${parameters.risk_type}
Time horizon: ${parameters.time_horizon}
Use case: ${parameters.use_case || "general assessment"}

Verified Pacific climate data: ${JSON.stringify(data)}
${seasonalContext ? `Current seasonal context: ${seasonalContext}` : ""}

Produce a structured risk assessment. Include:
1. Current risk level (low/medium/high/critical) with data justification
2. Trend direction (improving/stable/worsening)
3. Key risk drivers from the data
4. Confidence rating (how complete is the data coverage?)
5. Recommended actions for the stated use case

IMPORTANT: Only cite risks that are evidenced in the provided data.
Do not extrapolate beyond what the data shows.
Flag any gaps in data coverage explicitly.

Format as JSON: risk_level, trend, confidence (0-1),
key_drivers (array), recommendations (array), data_gaps (array).`;
  }
}
