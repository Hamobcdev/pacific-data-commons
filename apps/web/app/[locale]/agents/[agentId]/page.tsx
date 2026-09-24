import { getTranslations } from "next-intl/server";
import { findCatalogueEntry } from "@/lib/agents/types";
import { AgentRunForm } from "@/components/agents/AgentRunForm";
import { AgentMarketplaceComingSoon } from "@/components/agents/AgentMarketplaceComingSoon";
import { isAgentMarketplaceEnabled } from "@/lib/agents/marketplaceStatus";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Agent detail + run interface (Deliverable 7) — replaces the Session 6.1
 * "coming soon" scaffold. Reads `?wallet=` (set by the dashboard's "Use
 * earnings to query agents" link, Deliverable 8) to pre-load the visitor's
 * identity into the run form and, if that address matches a registered
 * provider, show their earned/spent balance above it.
 */
export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: { agentId: string };
  searchParams: { wallet?: string };
}) {
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

  // No point querying a provider's balance to pre-load a run form that
  // won't render — see isAgentMarketplaceEnabled()'s doc comment.
  let walletBalance: { totalRevenueUsdc: number; agentSpendUsdc: number } | undefined;
  if (marketplaceEnabled && searchParams.wallet) {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("providers")
      .select("total_revenue_usdc, agent_spend_usdc")
      .eq("wallet_address", searchParams.wallet)
      .maybeSingle();
    if (data) {
      walletBalance = {
        totalRevenueUsdc: (data.total_revenue_usdc as number) ?? 0,
        agentSpendUsdc: (data.agent_spend_usdc as number) ?? 0,
      };
    }
  }

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
          <AgentRunForm agent={entry} presetWallet={searchParams.wallet} walletBalance={walletBalance} />
        ) : (
          <AgentMarketplaceComingSoon />
        )}
      </div>
    </div>
  );
}
