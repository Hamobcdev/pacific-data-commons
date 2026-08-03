import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Provider } from "@pdc/shared-types";

const SILVER_THRESHOLD = 3;

export interface TrustTierProgressProps {
  provider: Provider;
  /** Highest upvote count across this provider's endpoints — the provider
   * reaches Silver once any one endpoint crosses the threshold
   * (check_silver_threshold in session1_migration.sql). */
  bestUpvoteCount: number;
}

/**
 * Silver tier progress widget (Deliverable 9). SBP records community
 * signals here — it never assesses quality (CLAUDE.md Section 8).
 */
export function TrustTierProgress({ provider, bestUpvoteCount }: TrustTierProgressProps) {
  const tier = provider.trust_tier;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trust Tier Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          <li className="flex items-center gap-2">
            <span className={tier === "bronze" ? "text-navy" : "text-gray-400"}>●</span>
            <div>
              <p className={tier === "bronze" ? "font-medium text-navy" : "text-gray-500"}>Bronze {tier === "bronze" && "(current)"}</p>
              <p className="text-xs text-gray-500">Identity verified ✓</p>
            </div>
          </li>
          <li className="flex items-center gap-2">
            <span className={tier === "silver" || tier === "gold" ? "text-navy" : "text-gray-400"}>○</span>
            <div className="flex-1">
              <p className={tier === "silver" ? "font-medium text-navy" : "text-gray-500"}>Silver {tier === "silver" && "(current)"}</p>
              <p className="text-xs text-gray-500">Community verified</p>
              {tier === "bronze" && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 w-24 rounded-full bg-gray-200">
                    <div
                      className="h-1.5 rounded-full bg-ocean"
                      style={{ width: `${Math.min(100, (bestUpvoteCount / SILVER_THRESHOLD) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">
                    {Math.min(bestUpvoteCount, SILVER_THRESHOLD)} of {SILVER_THRESHOLD} upvotes
                  </span>
                </div>
              )}
            </div>
          </li>
          <li className="flex items-center gap-2">
            <span className={tier === "gold" ? "text-navy" : "text-gray-400"}>○</span>
            <div>
              <p className={tier === "gold" ? "font-medium text-navy" : "text-gray-500"}>Gold {tier === "gold" && "(current)"}</p>
              <p className="text-xs text-gray-500">Peer reviewed — submit a DOI to upgrade ($25)</p>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
