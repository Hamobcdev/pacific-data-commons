import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { InstitutionalPanel } from "@/components/register/InstitutionalPanel";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { GlobalFooter } from "@/components/nav/GlobalFooter";
import { Link } from "@/i18n/navigation";

const DIRECTORY_API_URL = "https://pdcdirectory-api-production.up.railway.app";
const AGENTS_API_URL = "https://pdcagents-production.up.railway.app";

/**
 * Session 21 (Deliverable 3) — the page outreach emails (NZ developer
 * group, Algorand Foundation, GoPlausible) link to before any outreach
 * happens. Same three-column (public) shell as faq/page.tsx, same
 * hardcoded-English-content convention as that page (Decision 9's i18n
 * stubs cover UI chrome, not long-form technical prose — see that page's
 * own doc comment) — only more so here, since this content is code
 * examples a non-English-speaking developer would need in English anyway
 * to match the API's actual field names.
 *
 * DIRECTORY_API_URL/AGENTS_API_URL above are the Railway service URLs the
 * Session 21 brief specified — not independently re-verified against a
 * live Railway dashboard (no Railway CLI access in this environment, same
 * limitation noted in Session 20). Worth a quick manual check before
 * sending outreach email that actually links here.
 */
export default async function DevelopersPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <GlobalNav provider={null} />

      <HeaderBand>
        <div className="flex items-end h-full px-6 pb-3">
          <h1 className="text-white text-lg font-semibold">Developer Quickstart</h1>
        </div>
      </HeaderBand>

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-3xl px-6 py-10 space-y-10">
            <section>
              <p className="text-lg text-gray-700">Build AI agents that earn Pacific institutions revenue.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">What is PDC?</h2>
              <p className="text-base text-gray-700 leading-relaxed">
                Pacific Data Commons is a sovereign data marketplace built on Algorand using the x402 payment
                protocol. AI agents pay Pacific institutions directly in USDC per query. No subscriptions. No
                intermediaries. SBP is the directory and payment infrastructure only — it never holds funds, never
                stores your queries&apos; data, and never touches provider data.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">
                Quick start — query Pacific data in 3 steps
              </h2>

              <h3 className="text-base font-semibold text-navy mt-4 mb-2">Step 1: Get a quote</h3>
              <p className="text-base text-gray-700 mb-2">
                Every agent run starts with a free dry-run quote — no payment required to see pricing and preview
                the response shape.
              </p>
              <CodeBlock>
                {`curl -X POST ${AGENTS_API_URL}/agents/fisheries/quote \\
  -H "Content-Type: application/json" \\
  -d '{"parameters": {"species": "skipjack", "report_type": "stock_assessment", "eez": "WS"},
       "user_wallet": "YOUR_ALGORAND_WALLET_ADDRESS",
       "dry_run": true}'`}
              </CodeBlock>

              <h3 className="text-base font-semibold text-navy mt-6 mb-2">Step 2: Pay and execute</h3>
              <p className="text-base text-gray-700">
                Confirming the quote requires a connected Algorand wallet (Pera or Lute) and a signed on-chain USDC
                payment — the same flow used in PDC&apos;s own{" "}
                <Link href="/agents" className="text-ocean hover:underline">
                  Agent Marketplace
                </Link>
                . Once payment settles on-chain, the agent executes and returns your report.
              </p>

              <h3 className="text-base font-semibold text-navy mt-6 mb-2">Step 3: Receive structured Pacific data</h3>
              <p className="text-base text-gray-700 mb-2">
                Every endpoint response follows the Pacific Data Protocol (PDP) v1.0 schema — a consistent envelope
                across every provider&apos;s data:
              </p>
              <CodeBlock>
                {`{
  "schema_version": "pdp-1.0",
  "category": "fisheries",
  "data_warning": "...",
  "provider": { "institution": "...", "provenance_hash": "..." },
  "data": { "...": "..." },
  "citation": "...",
  "accessed_at": "2026-08-17T10:00:00.000Z"
}`}
              </CodeBlock>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">
                Available data categories
              </h2>
              <ul className="list-disc pl-5 space-y-1 text-base text-gray-700">
                <li>Fisheries (live) — Pacific tuna stock assessments</li>
                <li>Ocean Conditions (live) — ENSO indicators, temperature anomalies</li>
                <li>Governance &amp; Policy (live) — Pacific digital economy research, working papers</li>
                <li>More categories coming: Agriculture, Climate, Trade, Maritime</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">Pricing</h2>
              <ul className="list-disc pl-5 space-y-1 text-base text-gray-700">
                <li>Directory search: $0.01 USDC</li>
                <li>Data summary: from $0.01 USDC</li>
                <li>Full dataset: from $5.00 USDC</li>
              </ul>
              <p className="text-sm text-gray-500 mt-2">
                Providers set their own prices per tier. 97% of every query fee goes directly to the provider&apos;s
                wallet — SBP never holds funds.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">Register</h2>
              <p className="text-base text-gray-700">
                Have Pacific data to list?{" "}
                <Link href="/onboarding/register" className="text-ocean hover:underline">
                  Register as a provider
                </Link>
                . Building on top of existing PDC data?{" "}
                <Link href="/agents" className="text-ocean hover:underline">
                  Browse the Agent Marketplace
                </Link>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">Resources</h2>
              <ul className="space-y-1 text-base">
                <li>
                  <a href="https://dev.algorand.co/resources/x402-on-algorand/" target="_blank" rel="noreferrer" className="text-ocean hover:underline">
                    x402 Protocol on Algorand
                  </a>
                </li>
                <li>
                  <a href="https://algorand.co/global-x402-challenge" target="_blank" rel="noreferrer" className="text-ocean hover:underline">
                    Algorand x402 Global Challenge
                  </a>
                </li>
                <li className="text-gray-700">
                  API endpoint: <code className="text-sm bg-light-bg px-1.5 py-0.5 rounded">{DIRECTORY_API_URL}</code>
                </li>
                <li className="text-gray-700">
                  Agent API: <code className="text-sm bg-light-bg px-1.5 py-0.5 rounded">{AGENTS_API_URL}</code>
                </li>
                <li>
                  <a href="mailto:anthony@synergybcpacific.com" className="text-ocean hover:underline">
                    Contact: anthony@synergybcpacific.com
                  </a>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">External sources</h2>
              <p className="text-base text-gray-700">
                PDC agents can query any approved x402-compatible endpoint beyond PDC&apos;s own listings.
              </p>
              <CodeBlock>{`GET ${DIRECTORY_API_URL}/external-sources`}</CodeBlock>
            </section>
          </div>
        </main>

        <aside
          className="hidden xl:flex flex-col flex-shrink-0 w-48 2xl:w-56
            sticky top-14 h-[calc(100vh-56px)] overflow-hidden border-l border-gray-100"
        >
          <InstitutionalPanel />
        </aside>
      </div>

      <GlobalFooter />
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-navy px-4 py-3 text-sm text-white">
      <code>{children}</code>
    </pre>
  );
}
