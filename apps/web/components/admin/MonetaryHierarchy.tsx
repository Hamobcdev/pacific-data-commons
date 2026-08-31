import { Badge } from "@/components/ui/badge";

interface Tier {
  label: string;
  name: string;
  members?: readonly string[];
  status: "active" | "stub";
  note?: string;
}

/**
 * Session 39 — visual four-tier hierarchy. Content sourced from the
 * CBS-oversight ecosystem response's `hierarchy` field, which is itself
 * derived server-side from @pdc/financial-rails' hierarchy.ts (single
 * source of truth) — this component renders it, it doesn't restate it as
 * a second hand-maintained copy.
 */
export function MonetaryHierarchy({
  tier2Members,
  tier3Members,
}: {
  tier2Members: readonly string[];
  tier3Members: readonly string[];
}) {
  const tiers: Tier[] = [
    { label: "Tier 1", name: "Central Bank of Samoa", status: "stub", note: "Monetary authority, escrow custodian, KYC/AML final arbiter" },
    { label: "Tier 2", name: "Licensed commercial banks", members: tier2Members, status: "stub", note: "Operate under CBS licence" },
    { label: "Tier 3", name: "Mobile money providers", members: tier3Members, status: "stub", note: "Operate under tier 2 bank sponsorship" },
    { label: "Tier 4", name: "Synergy Blockchain Pacific", status: "active", note: "Infrastructure operator and payment router — no custody authority" },
  ];

  return (
    <div className="space-y-2">
      {tiers.map((tier) => (
        <div key={tier.label} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">{tier.label}</span>
              <p className="font-semibold text-navy">{tier.name}</p>
            </div>
            <Badge variant={tier.status === "active" ? "success" : "warning"}>{tier.status === "active" ? "Active" : "Stub"}</Badge>
          </div>
          {tier.members && tier.members.length > 0 && <p className="mt-2 text-sm text-gray-600">{tier.members.join(", ")}</p>}
          {tier.note && <p className="mt-1 text-xs text-gray-500">{tier.note}</p>}
        </div>
      ))}
    </div>
  );
}
