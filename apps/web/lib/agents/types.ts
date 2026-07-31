import type { AgentType, DataCategory } from "@pdc/shared-types";

/** Must match apps/agents/src/agents/registry.ts's AgentSlug exactly — the
 * URL path segment both apps/agents (POST /agents/:slug) and this catalogue
 * use. Two independent services each declare their own view of "what
 * agents exist" (this static catalogue vs. that service's live registry);
 * kept in sync by hand for now — a future session could have this page
 * fetch GET /agents from the live service instead. Flagged at end of
 * Session 7.
 */
export type AgentSlug = "trade" | "climate" | "fisheries" | "agricultural" | "remittance" | "grants";

export interface AgentFieldOption {
  value: string;
  label: string;
}

export interface AgentFieldDescriptor {
  name: string;
  label: string;
  kind: "text" | "select";
  options?: AgentFieldOption[];
  required: boolean;
  placeholder?: string;
}

export interface AgentCatalogueEntry {
  id: AgentSlug;
  name: string;
  description: string;
  categories: DataCategory[];
  priceRange: string;
  icon: string;
  note?: string;
  fields: AgentFieldDescriptor[];
}

/**
 * Static agent metadata (Deliverable 7) — agents are first-party, not
 * fetched from a database. `fields` mirrors each agent's Zod inputSchema in
 * apps/agents/src/agents/*.ts field-for-field; if one changes, this must
 * change with it.
 */
export const AGENT_CATALOGUE: AgentCatalogueEntry[] = [
  {
    id: "trade",
    name: "Pacific Trade Intelligence",
    description: "Export trends, price movements, and market comparison for Pacific commodities.",
    categories: ["trade", "demographics"],
    priceRange: "$3–8",
    icon: "📊",
    fields: [
      { name: "commodity", label: "Commodity", kind: "text", required: true, placeholder: "e.g. tuna, coconut oil, vanilla, kava" },
      { name: "country", label: "Country", kind: "text", required: true, placeholder: "Pacific nation name" },
      { name: "time_period", label: "Time period", kind: "text", required: false, placeholder: "e.g. 2018-2023 (defaults to last 5 years)" },
      { name: "comparison_countries", label: "Comparison countries", kind: "text", required: false, placeholder: "Comma-separated, optional" },
    ],
  },
  {
    id: "climate",
    name: "Pacific Climate Risk",
    description: "Structured risk assessment for cyclone, drought, sea level, and coral bleaching.",
    categories: ["climate", "ocean", "disaster_risk"],
    priceRange: "$5–15",
    icon: "🌊",
    fields: [
      { name: "location", label: "Location", kind: "text", required: true, placeholder: "Pacific location name" },
      {
        name: "risk_type",
        label: "Risk type",
        kind: "select",
        required: true,
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
        options: [
          { value: "current", label: "Current" },
          { value: "5_year", label: "5 year" },
          { value: "10_year", label: "10 year" },
          { value: "20_year", label: "20 year" },
        ],
      },
      { name: "use_case", label: "Use case", kind: "text", required: false, placeholder: "e.g. infrastructure planning, insurance underwriting" },
    ],
  },
  {
    id: "fisheries",
    name: "Pacific Fisheries Status",
    description: "Stock assessment with ocean condition context for Pacific tuna and coastal species.",
    categories: ["fisheries", "ocean"],
    priceRange: "$2–8",
    icon: "🐟",
    fields: [
      {
        name: "species",
        label: "Species",
        kind: "select",
        required: true,
        options: [
          { value: "skipjack", label: "Skipjack" },
          { value: "yellowfin", label: "Yellowfin" },
          { value: "bigeye", label: "Bigeye" },
          { value: "albacore", label: "Albacore" },
          { value: "all", label: "All" },
        ],
      },
      { name: "zone", label: "Zone", kind: "text", required: true, placeholder: "EEZ or country name, e.g. samoa_eez, Samoa" },
      { name: "year_range", label: "Year range", kind: "text", required: false, placeholder: "e.g. 2018-2023" },
      {
        name: "purpose",
        label: "Purpose",
        kind: "select",
        required: false,
        options: [
          { value: "stock_assessment", label: "Stock assessment" },
          { value: "licensing_decision", label: "Licensing decision" },
          { value: "conservation_review", label: "Conservation review" },
          { value: "commercial_planning", label: "Commercial planning" },
        ],
      },
    ],
  },
  {
    id: "agricultural",
    name: "Pacific Agricultural Exports",
    description: "Market outlook and planting guidance for Pacific export crops.",
    categories: ["agriculture", "trade", "climate"],
    priceRange: "$0–5",
    icon: "🌿",
    note: "Subsidised for Pacific smallholder farmers and cooperatives.",
    fields: [
      { name: "crop", label: "Crop", kind: "text", required: true, placeholder: "e.g. coconut oil, cocoa, vanilla, kava, taro" },
      { name: "country", label: "Country", kind: "text", required: true, placeholder: "Pacific nation name" },
      {
        name: "query_type",
        label: "Query type",
        kind: "select",
        required: true,
        options: [
          { value: "market_outlook", label: "Market outlook" },
          { value: "planting_advice", label: "Planting advice" },
          { value: "export_options", label: "Export options" },
          { value: "price_comparison", label: "Price comparison" },
        ],
      },
    ],
  },
  {
    id: "remittance",
    name: "Pacific Remittance Navigator",
    description: "Corridor rates, volume trends, and seasonal patterns for Pacific remittance flows.",
    categories: ["remittance", "demographics"],
    priceRange: "$2–5",
    icon: "💸",
    fields: [
      { name: "sending_country", label: "Sending country", kind: "text", required: true, placeholder: "e.g. New Zealand, Australia, United States" },
      { name: "receiving_country", label: "Receiving country", kind: "text", required: true, placeholder: "Pacific nation name" },
      { name: "amount_usd", label: "Amount (USD)", kind: "text", required: false, placeholder: "Optional — for corridor rate calculation" },
    ],
  },
  {
    id: "grants",
    name: "Pacific Grant Matcher",
    description: "Match your institution to active Pacific funding programmes from World Bank, ADB, GCF, DFAT and others.",
    categories: ["demographics", "climate", "trade"],
    priceRange: "$3–10",
    icon: "🎯",
    fields: [
      {
        name: "institution_type",
        label: "Institution type",
        kind: "select",
        required: true,
        options: [
          { value: "university", label: "University" },
          { value: "government", label: "Government" },
          { value: "ngo", label: "NGO" },
          { value: "private", label: "Private" },
          { value: "community", label: "Community" },
        ],
      },
      { name: "country", label: "Country", kind: "text", required: true, placeholder: "Pacific nation name" },
      { name: "focus_area", label: "Focus area", kind: "text", required: true, placeholder: "e.g. ocean conservation, digital infrastructure, food security" },
      { name: "data_assets", label: "Data assets", kind: "text", required: false, placeholder: "Optional — data your institution has that supports an application" },
    ],
  },
];

export function findCatalogueEntry(id: string): AgentCatalogueEntry | undefined {
  return AGENT_CATALOGUE.find((entry) => entry.id === id);
}

/** Maps this catalogue's URL slug to the shared-types AgentType the wire
 * protocol (AgentInput.agent_type) uses — kept here, next to the slug list
 * itself, so run-agent.ts and dry-run-agent.ts share one definition. */
export const AGENT_TYPE_BY_SLUG: Record<AgentSlug, AgentType> = {
  trade: "trade_intelligence",
  climate: "climate_risk",
  fisheries: "fisheries_status",
  agricultural: "agricultural_exports",
  remittance: "remittance_navigator",
  grants: "grant_matcher",
};
