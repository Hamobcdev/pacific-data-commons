import { getTranslations } from "next-intl/server";
import { findCatalogueEntry } from "@/lib/agents/types";
import { AgentRunForm } from "@/components/agents/AgentRunForm";
import { AgentMarketplaceComingSoon } from "@/components/agents/AgentMarketplaceComingSoon";
import { isAgentMarketplaceEnabled } from "@/lib/agents/marketplaceStatus";

/**
 * Agent detail + run interface (Deliverable 7) — replaces the Session 6.1
 * "coming soon" scaffold.
 *
 * Security fix: this page used to read `?wallet=` from the URL and query
 * the providers table directly with it — no auth, no ownership check.
 * Anyone who knew or guessed a provider's wallet address (public on-chain
 * data) could read that provider's revenue/spend by visiting this page
 * with `?wallet=<address>`. Removed entirely. If a visitor's provider
 * balance needs to show here again, it must come from an authenticated
 * server session (the same getResumedProvider() pattern the dashboard
 * uses), never a URL param.
 */
export default async function AgentDetailPage({ params }: { params: { agentId: string } }) {
  const entry = findCatalogueEntry(params.agentId);

  if (!entry) {
    const t = await getTranslations("Agents.detail");
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="rounded-lg border border-ocean/20 bg-light-bg p-6">
          <p className="font-medium text-navy">{t("notFound")}</p>
          <p className="mt-2 text-sm text-gray-600">{t("comingSoon")}</p>
        </div>
      </div>
    );
  }

  const marketplaceEnabled = isAgentMarketplaceEnabled();

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <p className="text-sm text-gray-500">{entry.categories.join(" · ")}</p>
      <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-navy">
        <span aria-hidden="true">{entry.icon}</span>
        {entry.name}
      </h1>
      <p className="mt-2 text-gray-600">{entry.description}</p>

      <div className="mt-6">
        {marketplaceEnabled ? (
          <AgentRunForm agent={entry} />
        ) : (
          <AgentMarketplaceComingSoon />
        )}
      </div>
    </div>
  );
}
