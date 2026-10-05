import { z } from "zod";
import type { AgentType, DataCategory } from "@pdc/shared-types";
import { BaseAgent } from "./base.js";

const inputSchema = z.object({
  indicator: z.enum(["gdp", "cpi", "fx", "crypto", "remittance", "arbitrage", "overview"]),
  country: z.string().optional(),
  time_period: z.string().optional(),
});

/**
 * Financial Intelligence Agent. All eight PDC endpoints this agent's
 * catalogue entry names (fiji-gdp, samoa-gdp, samoa-cpi, fx, crypto-rates,
 * crypto-history, arbitrage-signals, remittance-corridors) share one
 * data_category — "financial_flows" — so requiredCategories is a single
 * entry and BaseAgent.resolveEndpoints() resolves exactly one
 * financial_flows endpoint per run via directory search (category +
 * optional country), the same single-endpoint-per-category mechanism
 * every other agent already uses. There is no per-endpoint-path selection
 * mechanism in BaseAgent to pick a specific one of the eight by name.
 * `indicator` steers what the synthesis prompt below asks Claude to focus
 * on — the same role risk_type/species/query_type play for
 * climate/fisheries/agricultural — not which endpoint gets queried.
 */
export class FinancialIntelligenceAgent extends BaseAgent {
  agentType: AgentType = "financial_intelligence";
  requiredCategories: DataCategory[] = ["financial_flows"];
  inputSchema = inputSchema;

  synthesisPrompt(data: Record<string, unknown>[], parameters: Record<string, string | undefined>): string {
    return `You are a Pacific financial intelligence analyst.

Indicator focus: ${parameters.indicator}
${parameters.country ? `Country: ${parameters.country}` : "Scope: Pacific region-wide"}
${parameters.time_period ? `Time period: ${parameters.time_period}` : "Time period: latest available"}

Verified Pacific financial data: ${JSON.stringify(data)}

Produce a structured economic briefing:
1. Headline figures relevant to the requested indicator (cite the data)
2. Trend direction (growing, contracting, stable) with the underlying numbers
3. Any notable volatility, revision, or preliminary-data caveat present in the source
4. One practical implication for a Pacific institution or investor

Format as JSON with fields: summary (2 sentences), headline_figures (array),
trend (string), caveats (string or null), practical_implication (string).
Do not include any data not present in the provided dataset.`;
  }
}
