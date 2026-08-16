import { redirect } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getResumedProvider } from "@/lib/onboarding/resume";
import { getAllTransactions } from "@/lib/dashboard/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/nav/Breadcrumb";

/** Session 21 (Deliverable 5) — wires the WalletPanel's previously
 * anchor-only "View transaction history →" link to a real page. */
export default async function TransactionHistoryPage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const t = await getTranslations("Dashboard");
  const tNav = await getTranslations("Nav");
  const resumed = await getResumedProvider();
  if (!resumed) {
    return redirect({ href: "/onboarding/register", locale });
  }

  const transactions = await getAllTransactions(resumed.providerId);

  return (
    <div className="px-6 py-8 space-y-4 max-w-3xl">
      <Breadcrumb items={[{ label: tNav("dashboard"), href: "/dashboard" }, { label: t("transaction_history_title") }]} />
      <h1 className="text-2xl font-bold text-navy">{t("transaction_history_title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("recent_queries")}</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-gray-500">{t("no_transactions")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4 font-medium">{t("tx_date")}</th>
                    <th className="py-2 pr-4 font-medium">{t("tx_type")}</th>
                    <th className="py-2 pr-4 font-medium">{t("tx_amount")}</th>
                    <th className="py-2 font-medium">{t("tx_algo_id")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-2 pr-4 text-gray-600">{new Date(tx.queried_at).toLocaleDateString()}</td>
                      <td className="py-2 pr-4 text-navy">
                        {tx.transaction_type}
                        {tx.response_tier && <span className="ml-1 text-xs text-gray-400">({tx.response_tier})</span>}
                      </td>
                      <td className="py-2 pr-4 font-medium text-navy">${tx.amount_usdc.toFixed(2)}</td>
                      <td className="py-2 font-mono text-xs text-gray-400">{tx.algo_tx_id ?? "pending"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
