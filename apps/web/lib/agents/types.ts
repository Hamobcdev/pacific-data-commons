import {
  AGENT_REGISTRY,
  AGENT_SLUGS,
  findAgentCatalogueEntry,
  priceRangeLabel,
  type AgentCatalogueField as AgentFieldDescriptor,
  type AgentSlug,
  type AgentType,
} from "@pdc/shared-types";

export type { AgentSlug, AgentFieldDescriptor };

export interface AgentCatalogueEntry {
  id: AgentSlug;
  name: string;
  description: string;
  categories: string[];
  priceRange: string;
  icon: string;
  note?: string;
  fields: AgentFieldDescriptor[];
}

/**
 * Static agent metadata (Session 8, Flag 8) — projects @pdc/shared-types'
 * AGENT_REGISTRY (the single source of truth, shared with apps/agents) into
 * this page's `AgentCatalogueEntry` shape. Agents are first-party, not
 * fetched from a database.
 */
export const AGENT_CATALOGUE: AgentCatalogueEntry[] = AGENT_SLUGS.map((slug) => {
  const entry = AGENT_REGISTRY[slug];
  return {
    id: entry.slug,
    name: entry.name,
    description: entry.description,
    categories: entry.categories,
    priceRange: priceRangeLabel(entry),
    icon: entry.icon,
    note: entry.note,
    fields: entry.fields,
  };
});

export function findCatalogueEntry(id: string): AgentCatalogueEntry | undefined {
  return AGENT_CATALOGUE.find((entry) => entry.id === id);
}

/** Maps this catalogue's URL slug to the shared-types AgentType the wire
 * protocol (AgentInput.agent_type) uses — kept here, next to the slug list
 * itself, so run-agent.ts and dry-run-agent.ts share one definition. */
export const AGENT_TYPE_BY_SLUG: Record<AgentSlug, AgentType> = Object.fromEntries(
  AGENT_SLUGS.map((slug) => [slug, AGENT_REGISTRY[slug].agentType]),
) as Record<AgentSlug, AgentType>;

/** Re-exported for callers that only need one entry's markup, e.g.
 * QuoteDisplay's cost breakdown (Session 8, Deliverable 3). */
export function findAgentEntry(slug: string) {
  return findAgentCatalogueEntry(slug);
}
