import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown on the agent run page only when the visitor arrived via the
 * dashboard's "Use earnings to query agents" link (Deliverable 8) — their
 * provider wallet is pre-loaded, so this shows the same earned/spent
 * numbers as the dashboard's WalletPanel, condensed, as a reminder of what
 * they're spending against.
 */
export function WalletBalance({
  walletAddress,
  totalRevenueUsdc,
  agentSpendUsdc,
}: {
  walletAddress: string;
  totalRevenueUsdc: number;
  agentSpendUsdc: number;
}) {
  const netBalance = totalRevenueUsdc - agentSpendUsdc;
  const short = `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;

  return (
    <Card className="bg-light-bg">
      <CardContent className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm">
        <span className="font-mono text-xs text-gray-500">{short}</span>
        <span className="text-green-700">Earned ${totalRevenueUsdc.toFixed(2)}</span>
        <span className="text-red-700">Spent ${agentSpendUsdc.toFixed(2)}</span>
        <span className="font-semibold text-navy">Net ${netBalance.toFixed(2)}</span>
      </CardContent>
    </Card>
  );
}
