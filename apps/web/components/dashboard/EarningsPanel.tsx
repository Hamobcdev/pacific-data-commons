import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Provider, TransactionLogEntry } from "@pdc/shared-types";

const TRUST_TIER_VARIANT = { bronze: "neutral", silver: "success", gold: "warning" } as const;

/** CLAUDE.md Section 8 — trust tier upgrade paths, shown so a provider
 * knows exactly what's next without looking it up elsewhere. */
const NEXT_TIER_HINT: Record<Provider["trust_tier"], string | null> = {
  bronze: "Silver requires 3 upvotes from 3 different verified purchaser wallets — free to achieve.",
  silver: "Gold requires documented peer review (DOI) plus a $25 one-time SBP clerical review.",
  gold: null,
};

export async function EarningsPanel({ provider, transactions }: { provider: Provider; transactions: TransactionLogEntry[] }) {
  const t = await getTranslations("Dashboard");
  const nextTierHint = NEXT_TIER_HINT[provider.trust_tier];

  return (
    <Card id="recent-queries">
      <CardHeader>
        <CardTitle>{t("recent_queries")}</CardTitle>
        <div className="mt-2 flex items-center gap-3">
          <Badge variant={TRUST_TIER_VARIANT[provider.trust_tier]}>
            {t("trust_tier")}: {provider.trust_tier}
          </Badge>
          <span className="text-sm text-gray-500">
            {t("total_queries")}: {provider.total_queries_served}
          </span>
        </div>
        {nextTierHint && <p className="mt-1 text-xs text-gray-500">{nextTierHint}</p>}
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-500">No queries yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {transactions.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="text-navy">{tx.transaction_type}</p>
                  <p className="font-mono text-xs text-gray-400">{tx.algo_tx_id ?? "pending"}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-navy">${tx.amount_usdc.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{new Date(tx.queried_at).toLocaleDateString()}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
