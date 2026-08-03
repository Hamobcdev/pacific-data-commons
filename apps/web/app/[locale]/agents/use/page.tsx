import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { AGENT_CATALOGUE } from "@/lib/agents/types";

/**
 * Quick-launch agent picker (Deliverable 7) — replaces the Session 6.1
 * "coming soon" scaffold. Distinct from the full /agents catalogue: this is
 * a minimal picker meant for a visitor who already has a wallet in hand
 * (e.g. a provider following the dashboard's "Use earnings to query
 * agents" link) and just needs to choose which agent to run next, with
 * that wallet forwarded through to whichever agent they pick.
 */
export default async function UseAgentPage({ searchParams }: { searchParams: { wallet?: string } }) {
  const t = await getTranslations("Agents.use");
  const walletQuery = searchParams.wallet ? `?wallet=${encodeURIComponent(searchParams.wallet)}` : "";

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <ul className="mt-6 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {AGENT_CATALOGUE.map((agent) => (
          <li key={agent.id}>
            <Link href={`/agents/${agent.id}${walletQuery}`} className="flex items-center gap-3 p-4 hover:bg-light-bg">
              <span className="text-xl" aria-hidden="true">
                {agent.icon}
              </span>
              <div>
                <p className="font-medium text-navy">{agent.name}</p>
                <p className="text-sm text-gray-500">{agent.priceRange} per report</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
