"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AGENT_CATALOGUE, type AgentSlug } from "@/lib/agents/types";
import { AgentCard } from "@/components/agents/AgentCard";
import { AgentMarketplaceComingSoon } from "@/components/agents/AgentMarketplaceComingSoon";
import { isAgentMarketplaceEnabled } from "@/lib/agents/marketplaceStatus";

type FilterValue = AgentSlug | "all";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All Agents" },
  { value: "fisheries", label: "Fisheries" },
  { value: "climate", label: "Climate" },
  { value: "trade", label: "Trade" },
  { value: "agricultural", label: "Agriculture" },
  { value: "remittance", label: "Remittance" },
  { value: "grants", label: "Grants" },
  { value: "financial", label: "Financial" },
];

/**
 * The full marketplace catalogue (Deliverable 7 — replaces the Session 6.1
 * "coming soon" scaffold). A client component: the filter needs local
 * state and the catalogue is a small static list (seven entries), so
 * there's no cost to filtering client-side vs. a server round-trip per
 * filter click.
 */
export default function AgentsPage() {
  const t = useTranslations("AgentMarketplace");
  const [filter, setFilter] = useState<FilterValue>("all");

  const filtered = useMemo(
    () => (filter === "all" ? AGENT_CATALOGUE : AGENT_CATALOGUE.filter((agent) => agent.id === filter || agent.categories.includes(filter))),
    [filter],
  );

  return (
    // Session 12 fix: mx-auto removed — the agents layout's flex row
    // already centres this column between the two side panels.
    <div className="max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-4 text-gray-600">{t("subtitle")}</p>
      <p className="mt-2 text-sm text-gray-500">{t("language_note")}</p>

      {!isAgentMarketplaceEnabled() && (
        <div className="mt-6">
          <AgentMarketplaceComingSoon compact />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.value ? "bg-navy text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {f.value === "all" ? t("filter_all") : f.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
