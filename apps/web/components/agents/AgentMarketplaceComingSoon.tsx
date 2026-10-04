import { Card, CardContent } from "@/components/ui/card";
import { AGENT_MARKETPLACE_CONTACT_EMAIL } from "@/lib/agents/marketplaceStatus";

/**
 * Shown instead of the interactive run flow while the Agent Marketplace's
 * backend is suspended (see lib/agents/marketplaceStatus.ts). Deliberately
 * reads as active development, not an outage — no "error", no
 * "unavailable", no suggestion to retry. CLAUDE.md §23 (Design-Partner
 * Programme) makes onboarding agent developers and data providers a live,
 * current goal, so this doubles as that recruitment touchpoint rather than
 * just an apology.
 */
export function AgentMarketplaceComingSoon({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="border-ocean/20 bg-light-bg">
      <CardContent className={compact ? "py-4" : "py-8 text-center"}>
        <p className="font-medium text-navy">Pacific Data Commons is live on Algorand Mainnet.</p>
        <p className="mt-2 text-sm text-gray-600">
          Real Pacific data. Real payments. Agent querying via x402 — explore our endpoints or get involved as a provider.
        </p>
        <p className="mt-3 text-sm text-gray-700">
          Want your institution&apos;s data or agent to be part of Pacific Data Commons?{" "}
          <a href={`mailto:${AGENT_MARKETPLACE_CONTACT_EMAIL}`} className="text-ocean hover:underline">
            Contact us
          </a>{" "}
          — we&apos;re onboarding partners now.
        </p>
      </CardContent>
    </Card>
  );
}
