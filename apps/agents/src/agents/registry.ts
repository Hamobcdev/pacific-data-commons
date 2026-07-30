import type { AgentType, DataCategory } from "@pdc/shared-types";
import type { Env } from "../types/env.js";
import { BaseAgent, type AgentRuntimeConfig } from "./base.js";
import { TradeIntelligenceAgent } from "./trade.js";
import { ClimateRiskAgent } from "./climate.js";
import { FisheriesStatusAgent } from "./fisheries.js";
import { AgriculturalExportsAgent } from "./agricultural.js";
import { RemittanceNavigatorAgent } from "./remittance.js";
import { GrantMatcherAgent } from "./grants.js";

export type AgentSlug = "trade" | "climate" | "fisheries" | "agricultural" | "remittance" | "grants";

export interface AgentRegistryEntry {
  slug: AgentSlug;
  agentType: AgentType;
  name: string;
  description: string;
  categories: DataCategory[];
  priceRangeUsdc: [number, number];
  /** Human-readable field descriptions for GET /agents/:type — hand-written
   * rather than derived from the zod schema (no schema-to-JSON-Schema
   * dependency in this repo yet), kept in sync with each agent's
   * inputSchema by the person who edits it. */
  parameters: Record<string, string>;
  create: (config: AgentRuntimeConfig) => BaseAgent;
  agentIdFromEnv: (env: Env) => string | undefined;
}

/**
 * Central list every route in index.ts mounts from — one place all six
 * agents' HTTP-facing metadata lives, so GET /agents, GET /agents/:type,
 * and the six POST routes can never describe a different agent than the
 * one actually running.
 */
export const AGENT_REGISTRY: AgentRegistryEntry[] = [
  {
    slug: "trade",
    agentType: "trade_intelligence",
    name: "Pacific Trade Intelligence",
    description: "Export trends, price movements, and market comparison for Pacific commodities.",
    categories: ["trade", "demographics"],
    priceRangeUsdc: [3, 8],
    parameters: {
      commodity: "Commodity name, e.g. tuna, coconut oil, vanilla, kava",
      country: "Pacific nation name",
      time_period: "Optional — e.g. 2018-2023, defaults to last 5 years",
      comparison_countries: "Optional — comma-separated list for market comparison",
    },
    create: (config) => new TradeIntelligenceAgent(config),
    agentIdFromEnv: (env) => env.TRADE_AGENT_ID,
  },
  {
    slug: "climate",
    agentType: "climate_risk",
    name: "Pacific Climate Risk",
    description: "Structured risk assessment for cyclone, drought, sea level, and coral bleaching.",
    categories: ["climate", "ocean", "disaster_risk"],
    priceRangeUsdc: [5, 15],
    parameters: {
      location: "Pacific location name",
      risk_type: "One of: cyclone, drought, sea_level, coral_bleaching, flooding, all",
      time_horizon: "One of: current, 5_year, 10_year, 20_year",
      use_case: "Optional — e.g. infrastructure planning, insurance underwriting",
    },
    create: (config) => new ClimateRiskAgent(config),
    agentIdFromEnv: (env) => env.CLIMATE_AGENT_ID,
  },
  {
    slug: "fisheries",
    agentType: "fisheries_status",
    name: "Pacific Fisheries Status",
    description: "Stock assessment with ocean condition context for Pacific tuna and coastal species.",
    categories: ["fisheries", "ocean"],
    priceRangeUsdc: [2, 8],
    parameters: {
      species: "One of: skipjack, yellowfin, bigeye, albacore, all",
      zone: "EEZ name or country name, e.g. samoa_eez, Samoa",
      year_range: "Optional — e.g. 2018-2023",
      purpose: "Optional — one of: stock_assessment, licensing_decision, conservation_review, commercial_planning",
    },
    create: (config) => new FisheriesStatusAgent(config),
    agentIdFromEnv: (env) => env.FISHERIES_AGENT_ID,
  },
  {
    slug: "agricultural",
    agentType: "agricultural_exports",
    name: "Pacific Agricultural Exports",
    description: "Market outlook and planting guidance for Pacific export crops.",
    categories: ["agriculture", "trade", "climate"],
    priceRangeUsdc: [0, 5],
    parameters: {
      crop: "Crop name, e.g. coconut oil, cocoa, vanilla, kava, taro",
      country: "Pacific nation name",
      query_type: "One of: market_outlook, planting_advice, export_options, price_comparison",
    },
    create: (config) => new AgriculturalExportsAgent(config),
    agentIdFromEnv: (env) => env.AGRICULTURAL_AGENT_ID,
  },
  {
    slug: "remittance",
    agentType: "remittance_navigator",
    name: "Pacific Remittance Navigator",
    description: "Corridor rates, volume trends, and seasonal patterns for Pacific remittance flows.",
    categories: ["remittance", "demographics"],
    priceRangeUsdc: [2, 5],
    parameters: {
      sending_country: "e.g. New Zealand, Australia, United States",
      receiving_country: "Pacific nation name",
      amount_usd: "Optional — for corridor rate calculation",
    },
    create: (config) => new RemittanceNavigatorAgent(config),
    agentIdFromEnv: (env) => env.REMITTANCE_AGENT_ID,
  },
  {
    slug: "grants",
    agentType: "grant_matcher",
    name: "Pacific Grant Matcher",
    description: "Match your institution to active Pacific funding programmes from World Bank, ADB, GCF, DFAT and others.",
    categories: ["demographics", "climate", "trade"],
    priceRangeUsdc: [3, 10],
    parameters: {
      institution_type: "One of: university, government, ngo, private, community",
      country: "Pacific nation name",
      focus_area: "e.g. ocean conservation, digital infrastructure, food security",
      data_assets: "Optional — what data the institution has that could support an application",
    },
    create: (config) => new GrantMatcherAgent(config),
    agentIdFromEnv: (env) => env.GRANTS_AGENT_ID,
  },
];

export function findAgentEntry(slug: string): AgentRegistryEntry | undefined {
  return AGENT_REGISTRY.find((entry) => entry.slug === slug);
}
