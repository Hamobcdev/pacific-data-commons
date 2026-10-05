/**
 * Single source of truth for first-party agent catalogue metadata (Session 8,
 * Flag 8). Before this file, apps/agents/src/agents/registry.ts and
 * apps/web/lib/agents/types.ts each hand-maintained their own copy of every
 * agent's name/description/categories/price range/parameter list — the two
 * copies could (and did, per Session 7's Flag 8) drift apart silently.
 *
 * This file owns everything that's pure data. It deliberately does NOT own:
 *   - apps/agents' `create` factories and `agentIdFromEnv` accessors — those
 *     are functions tied to that service's agent classes and env schema;
 *     importing agent implementation classes into shared-types would pull
 *     Anthropic/Zod agent logic into apps/web's bundle for no reason.
 *   - apps/web's field `kind`/`options` rendering concerns are kept here
 *     since they're pure data too (Flag 8 asked for exactly this to be
 *     deduplicated) — apps/agents only consumes the `name`/`description`
 *     projection of each field via fieldsToParameterMap() below, it never
 *     needs `kind` or `options`.
 */
import type { AgentType } from "./agents.js";
import type { DataCategory } from "./endpoints.js";

export type AgentSlug = "trade" | "climate" | "fisheries" | "agricultural" | "remittance" | "grants" | "financial";

export interface AgentFieldOption {
  value: string;
  label: string;
}

export interface AgentCatalogueField {
  name: string;
  label: string;
  kind: "text" | "select";
  required: boolean;
  /** Human-readable description — also used to build apps/agents' GET
   * /agents/:type `parameters` map, so it must stand alone without the
   * `label`/`placeholder` for context. */
  description: string;
  placeholder?: string;
  options?: AgentFieldOption[];
}

export interface AgentCatalogueEntry {
  slug: AgentSlug;
  agentType: AgentType;
  name: string;
  description: string;
  categories: DataCategory[];
  icon: string;
  priceRangeUsdc: [number, number];
  /**
   * Agent's margin over the summed PDC endpoint cost for a run, applied by
   * apps/agents/src/quote.ts when quoting the user's all-in price (Session 8
   * Deliverable 3 / Flag 6). 100% of the resulting user payment settles to
   * this agent's operational wallet (Decision 32) — SBP's 12% commission is
   * invoiced monthly on top, separately, not deducted here.
   */
  markupPct: number;
  /** Shown on the marketplace card when the standard markup doesn't apply
   * (e.g. agricultural's subsidised smallholder pricing). */
  note?: string;
  /**
   * Informational only — the PDC endpoint paths this agent's domain spans,
   * shown on the marketplace card. NOT a selection list BaseAgent's
   * resolveEndpoints() queries from: that method resolves one endpoint per
   * `categories` entry via directory search (category + optional country),
   * the same mechanism every agent uses, with no per-path filter. An agent
   * whose domain spans several endpoints that all share one data_category
   * (e.g. financial's 8 endpoints, all "financial_flows") will have this
   * list be longer than `categories` — that's expected, not a sign the two
   * should match 1:1.
   */
  endpoints?: string[];
  fields: AgentCatalogueField[];
}

export const AGENT_REGISTRY: Record<AgentSlug, AgentCatalogueEntry> = {
  trade: {
    slug: "trade",
    agentType: "trade_intelligence",
    name: "Pacific Trade Intelligence",
    description: "Export trends, price movements, and market comparison for Pacific commodities.",
    categories: ["trade", "demographics"],
    icon: "📊",
    priceRangeUsdc: [3, 8],
    markupPct: 20,
    fields: [
      { name: "commodity", label: "Commodity", kind: "text", required: true, description: "Commodity name, e.g. tuna, coconut oil, vanilla, kava", placeholder: "e.g. tuna, coconut oil, vanilla, kava" },
      { name: "country", label: "Country", kind: "text", required: true, description: "Pacific nation name", placeholder: "Pacific nation name" },
      { name: "time_period", label: "Time period", kind: "text", required: false, description: "Optional — e.g. 2018-2023, defaults to last 5 years", placeholder: "e.g. 2018-2023 (defaults to last 5 years)" },
      { name: "comparison_countries", label: "Comparison countries", kind: "text", required: false, description: "Optional — comma-separated list for market comparison", placeholder: "Comma-separated, optional" },
    ],
  },
  climate: {
    slug: "climate",
    agentType: "climate_risk",
    name: "Pacific Climate Risk",
    description: "Structured risk assessment for cyclone, drought, sea level, and coral bleaching.",
    categories: ["climate", "ocean", "disaster_risk"],
    icon: "🌊",
    priceRangeUsdc: [5, 15],
    markupPct: 20,
    fields: [
      { name: "location", label: "Location", kind: "text", required: true, description: "Pacific location name", placeholder: "Pacific location name" },
      {
        name: "risk_type",
        label: "Risk type",
        kind: "select",
        required: true,
        description: "One of: cyclone, drought, sea_level, coral_bleaching, flooding, all",
        options: [
          { value: "cyclone", label: "Cyclone" },
          { value: "drought", label: "Drought" },
          { value: "sea_level", label: "Sea level" },
          { value: "coral_bleaching", label: "Coral bleaching" },
          { value: "flooding", label: "Flooding" },
          { value: "all", label: "All" },
        ],
      },
      {
        name: "time_horizon",
        label: "Time horizon",
        kind: "select",
        required: true,
        description: "One of: current, 5_year, 10_year, 20_year",
        options: [
          { value: "current", label: "Current" },
          { value: "5_year", label: "5 year" },
          { value: "10_year", label: "10 year" },
          { value: "20_year", label: "20 year" },
        ],
      },
      { name: "use_case", label: "Use case", kind: "text", required: false, description: "Optional — e.g. infrastructure planning, insurance underwriting", placeholder: "e.g. infrastructure planning, insurance underwriting" },
    ],
  },
  fisheries: {
    slug: "fisheries",
    agentType: "fisheries_status",
    name: "Pacific Fisheries Status",
    description: "Stock assessment with ocean condition context for Pacific tuna and coastal species.",
    categories: ["fisheries", "ocean"],
    icon: "🐟",
    priceRangeUsdc: [2, 8],
    markupPct: 20,
    fields: [
      {
        name: "species",
        label: "Species",
        kind: "select",
        required: true,
        description: "One of: skipjack, yellowfin, bigeye, albacore, all",
        options: [
          { value: "skipjack", label: "Skipjack" },
          { value: "yellowfin", label: "Yellowfin" },
          { value: "bigeye", label: "Bigeye" },
          { value: "albacore", label: "Albacore" },
          { value: "all", label: "All" },
        ],
      },
      { name: "zone", label: "Zone", kind: "text", required: true, description: "EEZ name or country name, e.g. samoa_eez, Samoa", placeholder: "EEZ or country name, e.g. samoa_eez, Samoa" },
      { name: "year_range", label: "Year range", kind: "text", required: false, description: "Optional — e.g. 2018-2023", placeholder: "e.g. 2018-2023" },
      {
        name: "purpose",
        label: "Purpose",
        kind: "select",
        required: false,
        description: "Optional — one of: stock_assessment, licensing_decision, conservation_review, commercial_planning",
        options: [
          { value: "stock_assessment", label: "Stock assessment" },
          { value: "licensing_decision", label: "Licensing decision" },
          { value: "conservation_review", label: "Conservation review" },
          { value: "commercial_planning", label: "Commercial planning" },
        ],
      },
    ],
  },
  agricultural: {
    slug: "agricultural",
    agentType: "agricultural_exports",
    name: "Pacific Agricultural Exports",
    description: "Market outlook and planting guidance for Pacific export crops.",
    categories: ["agriculture", "trade", "climate"],
    icon: "🌿",
    priceRangeUsdc: [0, 5],
    markupPct: 10,
    note: "Subsidised for Pacific smallholder farmers and cooperatives.",
    fields: [
      { name: "crop", label: "Crop", kind: "text", required: true, description: "Crop name, e.g. coconut oil, cocoa, vanilla, kava, taro", placeholder: "e.g. coconut oil, cocoa, vanilla, kava, taro" },
      { name: "country", label: "Country", kind: "text", required: true, description: "Pacific nation name", placeholder: "Pacific nation name" },
      {
        name: "query_type",
        label: "Query type",
        kind: "select",
        required: true,
        description: "One of: market_outlook, planting_advice, export_options, price_comparison",
        options: [
          { value: "market_outlook", label: "Market outlook" },
          { value: "planting_advice", label: "Planting advice" },
          { value: "export_options", label: "Export options" },
          { value: "price_comparison", label: "Price comparison" },
        ],
      },
    ],
  },
  remittance: {
    slug: "remittance",
    agentType: "remittance_navigator",
    name: "Pacific Remittance Navigator",
    description: "Corridor rates, volume trends, and seasonal patterns for Pacific remittance flows.",
    categories: ["remittance", "demographics"],
    icon: "💸",
    priceRangeUsdc: [2, 5],
    markupPct: 20,
    fields: [
      { name: "sending_country", label: "Sending country", kind: "text", required: true, description: "e.g. New Zealand, Australia, United States", placeholder: "e.g. New Zealand, Australia, United States" },
      { name: "receiving_country", label: "Receiving country", kind: "text", required: true, description: "Pacific nation name", placeholder: "Pacific nation name" },
      { name: "amount_usd", label: "Amount (USD)", kind: "text", required: false, description: "Optional — for corridor rate calculation", placeholder: "Optional — for corridor rate calculation" },
    ],
  },
  grants: {
    slug: "grants",
    agentType: "grant_matcher",
    name: "Pacific Grant Matcher",
    description: "Match your institution to active Pacific funding programmes from World Bank, ADB, GCF, DFAT and others.",
    categories: ["demographics", "climate", "trade"],
    icon: "🎯",
    priceRangeUsdc: [3, 10],
    markupPct: 20,
    fields: [
      {
        name: "institution_type",
        label: "Institution type",
        kind: "select",
        required: true,
        description: "One of: university, government, ngo, private, community",
        options: [
          { value: "university", label: "University" },
          { value: "government", label: "Government" },
          { value: "ngo", label: "NGO" },
          { value: "private", label: "Private" },
          { value: "community", label: "Community" },
        ],
      },
      { name: "country", label: "Country", kind: "text", required: true, description: "Pacific nation name", placeholder: "Pacific nation name" },
      { name: "focus_area", label: "Focus area", kind: "text", required: true, description: "e.g. ocean conservation, digital infrastructure, food security", placeholder: "e.g. ocean conservation, digital infrastructure, food security" },
      { name: "data_assets", label: "Data assets", kind: "text", required: false, description: "Optional — what data the institution has that could support an application", placeholder: "Optional — data your institution has that supports an application" },
    ],
  },
  financial: {
    slug: "financial",
    agentType: "financial_intelligence",
    name: "Financial Intelligence Agent",
    description:
      "Monitors Pacific GDP, CPI, FX rates, crypto markets, and remittance corridors. Delivers structured briefings on regional economic indicators sourced from national statistics bureaus and live market feeds.",
    categories: ["financial_flows"],
    icon: "💹",
    priceRangeUsdc: [2, 6],
    markupPct: 20,
    endpoints: [
      "/finance/fiji-gdp",
      "/finance/samoa-gdp",
      "/finance/samoa-cpi",
      "/finance/fx",
      "/finance/crypto-rates",
      "/finance/crypto-history",
      "/finance/arbitrage-signals",
      "/finance/remittance-corridors",
    ],
    fields: [
      {
        name: "indicator",
        label: "Indicator focus",
        kind: "select",
        required: true,
        description: "One of: gdp, cpi, fx, crypto, remittance, arbitrage, overview",
        options: [
          { value: "gdp", label: "GDP" },
          { value: "cpi", label: "CPI / inflation" },
          { value: "fx", label: "FX rates" },
          { value: "crypto", label: "Crypto markets" },
          { value: "remittance", label: "Remittance corridors" },
          { value: "arbitrage", label: "DEX arbitrage" },
          { value: "overview", label: "Regional overview" },
        ],
      },
      { name: "country", label: "Country", kind: "text", required: false, description: "Optional — Pacific nation name, most relevant for gdp/cpi/remittance indicators", placeholder: "Pacific nation name (optional)" },
      { name: "time_period", label: "Time period", kind: "text", required: false, description: "Optional — e.g. 2020-2024, defaults to latest available", placeholder: "e.g. 2020-2024 (defaults to latest)" },
    ],
  },
};

export const AGENT_SLUGS = Object.keys(AGENT_REGISTRY) as AgentSlug[];

export function findAgentCatalogueEntry(slug: string): AgentCatalogueEntry | undefined {
  return AGENT_REGISTRY[slug as AgentSlug];
}

/** apps/agents' GET /agents/:type `parameters` field — name -> description,
 * dropping the UI-only kind/options/placeholder that only apps/web needs. */
export function fieldsToParameterMap(entry: AgentCatalogueEntry): Record<string, string> {
  return Object.fromEntries(entry.fields.map((f) => [f.name, f.description]));
}

export function priceRangeLabel(entry: AgentCatalogueEntry): string {
  const [min, max] = entry.priceRangeUsdc;
  return min === 0 ? `$0–${max}` : `$${min}–${max}`;
}

/**
 * User-pays-agent quote (Session 13) — the wire shape apps/agents' POST
 * /agents/:agentId/quote returns and apps/web's QuoteDisplay renders.
 * Colocated here (not duplicated in each app separately) per the Session 8
 * "Flag 8" lesson documented at the top of this file: two independently
 * hand-maintained copies of the same cross-service shape drifted apart
 * silently once before.
 */
export interface AgentQuoteEndpointCost {
  endpoint_id: string;
  name: string;
  price_usdc: number;
}

export interface AgentQuote {
  quote_id: string;
  agent_slug: AgentSlug;
  agent_type: AgentType;
  parameters: Record<string, string>;
  /** The wallet this quote was generated for — execute() requires the
   * settling transaction's sender to match this exact address. */
  user_wallet: string;
  endpoint_costs: AgentQuoteEndpointCost[];
  subtotal_usdc: number;
  markup_pct: number;
  markup_usdc: number;
  total_usdc: number;
  /** The agent's own operational wallet — the same wallet that pays PDC
   * endpoints downstream (Model F). The user pays into it; it nets the
   * markup. */
  pay_to_address: string;
  quote_expires_at: string;
  used: boolean;
}
