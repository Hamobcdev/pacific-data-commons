import { z } from "zod";
import type { AgentType, DataCategory } from "@pdc/shared-types";
import { BaseAgent } from "./base.js";

const inputSchema = z.object({
  institution_type: z.enum(["university", "government", "ngo", "private", "community"]),
  country: z.string().min(2),
  focus_area: z.string().min(5),
  data_assets: z.string().optional(),
});

/**
 * Augments PDC data with a static list of known active Pacific funding
 * programmes embedded directly in the prompt below — this is internal SBP
 * knowledge, not a queried PDC endpoint. External grant-database API
 * integration is Phase 2 (per the session brief); the programme list here
 * will go stale over time and needs a review cadence once one exists —
 * flagged at end of session.
 */
export class GrantMatcherAgent extends BaseAgent {
  agentType: AgentType = "grant_matcher";
  requiredCategories: DataCategory[] = ["demographics", "climate", "trade"];
  inputSchema = inputSchema;

  synthesisPrompt(data: Record<string, unknown>[], parameters: Record<string, string | undefined>): string {
    return `You are a Pacific grant intelligence analyst helping Pacific
institutions find funding opportunities.

Institution: ${parameters.institution_type} in ${parameters.country}
Focus area: ${parameters.focus_area}
Available data assets: ${parameters.data_assets || "not specified"}

Pacific context data from verified sources: ${JSON.stringify(data)}

Match this institution against these active Pacific funding programmes:
- World Bank Digital Economy for Pacific (DE4P): digital infrastructure, data systems
- ADB Pacific Private Sector Development Initiative (PSDI): SME and startup support
- Green Climate Fund (GCF): climate adaptation and mitigation, Pacific SIDS priority
- DFAT Pacific (Australia): digital integration, connectivity, governance
- Commonwealth Digital Access Programme: digital economy for small states
- ISOC Foundation Research Grants: internet governance, connectivity research
- Adaptation Fund: climate vulnerability, Pacific SIDS eligible
- Global Environment Facility (GEF): biodiversity, ocean, climate

For each matched programme:
1. Relevance score (1-5)
2. Why the institution qualifies
3. What data assets would strengthen the application
4. Application window if known
5. One specific recommendation

Only include programmes with relevance score 3 or above.
Format as JSON array: [{programme, relevance, qualification_reason,
data_recommendation, application_note}]`;
  }
}
