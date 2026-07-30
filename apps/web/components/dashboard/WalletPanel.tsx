import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Provider } from "@pdc/shared-types";

/**
 * The bidirectional wallet view (Deliverable 8) — earnings in, agent spend
 * out. `agent_spend_usdc` only exists because Session 7 added it to
 * shared-types' Provider interface (it was already a real DB column since
 * session6_1_agent_schema.sql, just missing from the type — see the
 * shared-types fix earlier this session).
 */
export async function WalletPanel({ provider }: { provider: Provider }) {
  const t = await getTranslations("Dashboard");
  const earned = provider.total_revenue_usdc;
  const spent = provider.agent_spend_usdc;
  const netBalance = earned - spent;
  const shortAddress = provider.wallet_address
    ? `${provider.wallet_address.slice(0, 6)}…${provider.wallet_address.slice(-4)}`
    : "Not connected";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("wallet_title")}</CardTitle>
        <p className="mt-1 font-mono text-xs text-gray-500">{shortAddress}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">{t("earned")}</span>
          <span className="font-medium text-green-700">+${earned.toFixed(2)} USDC ↑</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">{t("spent")}</span>
          <span className="font-medium text-red-700">-${spent.toFixed(2)} USDC ↓</span>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-sm font-semibold text-navy">
          <span>{t("net_balance")}</span>
          <span>${netBalance.toFixed(2)} USDC</span>
        </div>

        <div className="rounded-md bg-light-bg p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">{t("unpaid_fee")}</span>
            <span className="font-medium text-navy">${provider.tier12_earnings_accrued.toFixed(2)} USDC</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">{t("fee_note")}</p>
        </div>

        <div className="flex flex-col gap-2 pt-2 text-sm">
          <Link href={`/agents/use?wallet=${encodeURIComponent(provider.wallet_address ?? "")}`} className="text-ocean hover:underline">
            {t("use_earnings")} →
          </Link>
          <a href="#recent-queries" className="text-ocean hover:underline">
            {t("view_history")} →
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
