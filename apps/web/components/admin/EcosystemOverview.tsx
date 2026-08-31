import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EcosystemOverviewProps {
  activeNodeCount: number | null;
  totalNodeCount: number | null;
  activeProviders: number | null;
  stubProviders: number | null;
  totalChecks: number | null;
  flaggedChecks: number | null;
  clearedChecks: number | null;
  reserveUsdc: number | null;
}

function MetricCard({ title, primary, secondary, note }: { title: string; primary: string; secondary?: string; note?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-gray-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-navy">{primary}</p>
        {secondary && <p className="mt-1 text-sm text-gray-500">{secondary}</p>}
        {note && <p className="mt-1 text-xs text-amber-700">{note}</p>}
      </CardContent>
    </Card>
  );
}

/** Session 39 — four metric cards, same grid pattern as the provider
 * dashboard's own card row. Every value that has no live source yet
 * renders "—" rather than a fabricated number (P5 — no placeholders that
 * look like real data). */
export function EcosystemOverview({
  activeNodeCount,
  totalNodeCount,
  activeProviders,
  stubProviders,
  totalChecks,
  flaggedChecks,
  clearedChecks,
  reserveUsdc,
}: EcosystemOverviewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Active Platform Nodes"
        primary={activeNodeCount === null ? "—" : `${activeNodeCount} / ${totalNodeCount ?? "—"}`}
        secondary="Nodes discoverable via PSR registry"
      />
      <MetricCard
        title="Payment Providers"
        primary={activeProviders === null ? "—" : `${activeProviders} active`}
        secondary={stubProviders === null ? undefined : `${stubProviders} stub`}
      />
      <MetricCard
        title="Compliance Checks"
        primary={totalChecks === null ? "—" : String(totalChecks)}
        secondary={flaggedChecks === null || clearedChecks === null ? undefined : `${flaggedChecks} flagged · ${clearedChecks} cleared`}
      />
      <MetricCard
        title="Reserve Position (USDC)"
        primary={reserveUsdc === null ? "—" : `$${reserveUsdc.toFixed(2)}`}
        note="Stub — Type 3 escrow not yet activated"
      />
    </div>
  );
}
