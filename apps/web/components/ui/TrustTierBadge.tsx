import type { TrustTier } from "@pdc/shared-types";

export interface TrustTierBadgeProps {
  tier: TrustTier;
  upvoteCount: number;
  /** Shows "X of 3" progress toward Silver — provider dashboard only. */
  showProgress?: boolean;
}

const SILVER_THRESHOLD = 3;

const TIER_STYLE: Record<TrustTier, string> = {
  bronze: "bg-amber-100 text-amber-800 border-amber-300",
  silver: "bg-gray-100 text-gray-800 border-gray-300",
  gold: "bg-yellow-100 text-yellow-900 border-yellow-400",
};

const TIER_LABEL: Record<TrustTier, string> = {
  bronze: "Identity Verified",
  silver: "Community Verified",
  gold: "Peer Reviewed",
};

/**
 * Trust tier badge with vote count display (CLAUDE.md Section 8). SBP
 * verifies identity and records community signals — this badge never
 * implies SBP has assessed data quality, only the tier's actual meaning.
 */
export function TrustTierBadge({ tier, upvoteCount, showProgress }: TrustTierBadgeProps) {
  return (
    <div className="inline-flex flex-col gap-1">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TIER_STYLE[tier]}`}>
        {TIER_LABEL[tier]}
        {tier === "silver" && ` — ${upvoteCount} buyer${upvoteCount === 1 ? "" : "s"}`}
      </span>
      {showProgress && tier === "bronze" && (
        <span className="text-xs text-gray-500">
          {Math.min(upvoteCount, SILVER_THRESHOLD)} of {SILVER_THRESHOLD} upvotes toward Silver
        </span>
      )}
    </div>
  );
}
