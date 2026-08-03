import {
  AGENT_REGISTRY as AGENT_CATALOGUE,
  AGENT_SLUGS,
  fieldsToParameterMap,
  findAgentCatalogueEntry,
  type AgentSlug,
  type AgentType,
  type DataCategory,
} from "@pdc/shared-types";
import type { Env } from "../types/env.js";
import { BaseAgent, type AgentRuntimeConfig } from "./base.js";
import { TradeIntelligenceAgent } from "./trade.js";
import { ClimateRiskAgent } from "./climate.js";
import { FisheriesStatusAgent } from "./fisheries.js";
import { AgriculturalExportsAgent } from "./agricultural.js";
import { RemittanceNavigatorAgent } from "./remittance.js";
import { GrantMatcherAgent } from "./grants.js";

export type { AgentSlug };

const CREATE_BY_SLUG: Record<AgentSlug, (config: AgentRuntimeConfig) => BaseAgent> = {
  trade: (config) => new TradeIntelligenceAgent(config),
  climate: (config) => new ClimateRiskAgent(config),
  fisheries: (config) => new FisheriesStatusAgent(config),
  agricultural: (config) => new AgriculturalExportsAgent(config),
  remittance: (config) => new RemittanceNavigatorAgent(config),
  grants: (config) => new GrantMatcherAgent(config),
};

const AGENT_ID_ENV_BY_SLUG: Record<AgentSlug, (env: Env) => string | undefined> = {
  trade: (env) => env.TRADE_AGENT_ID,
  climate: (env) => env.CLIMATE_AGENT_ID,
  fisheries: (env) => env.FISHERIES_AGENT_ID,
  agricultural: (env) => env.AGRICULTURAL_AGENT_ID,
  remittance: (env) => env.REMITTANCE_AGENT_ID,
  grants: (env) => env.GRANTS_AGENT_ID,
};

export interface AgentRegistryEntry {
  slug: AgentSlug;
  agentType: AgentType;
  name: string;
  description: string;
  categories: DataCategory[];
  priceRangeUsdc: [number, number];
  markupPct: number;
  /** Human-readable field descriptions for GET /agents/:type — derived from
   * @pdc/shared-types' AGENT_REGISTRY.fields (Session 8, Flag 8), which is
   * the single place name/description/kind/options are hand-written now. */
  parameters: Record<string, string>;
  create: (config: AgentRuntimeConfig) => BaseAgent;
  agentIdFromEnv: (env: Env) => string | undefined;
}

/**
 * Central list every route in index.ts mounts from — one place all six
 * agents' HTTP-facing metadata lives, so GET /agents, GET /agents/:type,
 * and the six POST routes can never describe a different agent than the
 * one actually running. The data itself (name/description/categories/price/
 * fields) is sourced from @pdc/shared-types' AGENT_REGISTRY; only the
 * function-valued `create`/`agentIdFromEnv` are local to this service.
 */
export const AGENT_REGISTRY: AgentRegistryEntry[] = AGENT_SLUGS.map((slug) => {
  const entry = AGENT_CATALOGUE[slug];
  return {
    slug,
    agentType: entry.agentType,
    name: entry.name,
    description: entry.description,
    categories: entry.categories,
    priceRangeUsdc: entry.priceRangeUsdc,
    markupPct: entry.markupPct,
    parameters: fieldsToParameterMap(entry),
    create: CREATE_BY_SLUG[slug],
    agentIdFromEnv: AGENT_ID_ENV_BY_SLUG[slug],
  };
});

export function findAgentEntry(slug: string): AgentRegistryEntry | undefined {
  const catalogueEntry = findAgentCatalogueEntry(slug);
  if (!catalogueEntry) return undefined;
  return AGENT_REGISTRY.find((e) => e.slug === catalogueEntry.slug);
}
