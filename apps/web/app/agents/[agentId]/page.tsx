import { getTranslations } from "next-intl/server";

/**
 * Scaffold only (Session 6.1) — Session 7 replaces this with a real agent
 * profile lookup against the `agents` table (session6_1_agent_schema.sql).
 * Accepts any :agentId so the route exists without a 404; it does not yet
 * validate the id or fetch a record.
 */
export default async function AgentDetailPage({ params }: { params: { agentId: string } }) {
  const t = await getTranslations("Agents.detail");

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <p className="text-sm text-gray-500">{params.agentId}</p>
      <div className="mt-4 p-6 bg-light-bg rounded-lg border border-ocean/20">
        <p className="text-navy font-medium">{t("notFound")}</p>
        <p className="mt-2 text-sm text-gray-600">{t("comingSoon")}</p>
      </div>
    </div>
  );
}
