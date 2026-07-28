import { getTranslations } from "next-intl/server";

/** Scaffold only (Session 6.1) — the real "use an agent" flow (wallet
 * connect, spend approval, agent selection) is Session 7. */
export default async function UseAgentPage() {
  const t = await getTranslations("Agents.use");

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <div className="mt-4 p-6 bg-light-bg rounded-lg border border-ocean/20">
        <p className="text-sm text-gray-600">{t("comingSoon")}</p>
      </div>
    </div>
  );
}
