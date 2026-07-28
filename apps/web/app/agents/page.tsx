import { getTranslations } from "next-intl/server";

export default async function AgentsPage() {
  const t = await getTranslations("Agents");

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-4 text-gray-600">{t("subtitle")}</p>
      <div className="mt-8 p-6 bg-light-bg rounded-lg border border-ocean/20">
        <p className="text-navy font-medium">{t("coming_soon")}</p>
        <p className="mt-2 text-sm text-gray-600">{t("coming_soon_detail")}</p>
      </div>
    </div>
  );
}
