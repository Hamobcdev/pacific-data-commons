import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { InstitutionalPanel } from "@/components/register/InstitutionalPanel";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { GlobalFooter } from "@/components/nav/GlobalFooter";
import { Link } from "@/i18n/navigation";

const PSR_SPEC_URL = "/psr/v1/spec.json";
const PSR_SCHEMA_URL = "/psr/v1/endpoint-schema.json";

/**
 * Session 35 — Pacific Service Registry (PSR) developer page.
 * Same three-column (public) shell and hardcoded-English-content convention
 * as ../page.tsx (Decision 9's i18n stubs cover UI chrome, not long-form
 * technical prose — see that page's own doc comment).
 */
export default async function PsrPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <GlobalNav provider={null} />

      <HeaderBand>
        <div className="flex items-end h-full px-6 pb-3">
          <h1 className="text-white text-lg font-semibold">Pacific Service Registry</h1>
        </div>
      </HeaderBand>

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-3xl px-6 py-10 space-y-10">
            <section>
              <p className="text-lg text-gray-700">
                The machine-readable specification behind every discoverable, x402-payable Pacific data endpoint.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">What the PSR is</h2>
              <p className="text-base text-gray-700 leading-relaxed">
                The Pacific Service Registry is the machine-readable specification that defines how Pacific data
                service endpoints are registered, discovered, and paid for using the x402 protocol. It is
                infrastructure, not a product: a shared vocabulary that lets services describe themselves in a way
                any agent, developer, or institution can read without a bilateral integration.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">How it relates to PDC</h2>
              <p className="text-base text-gray-700 leading-relaxed">
                Pacific Data Commons is the reference implementation and live network for the PSR. SBP maintains the
                specification; PDC is the operating instance of it — the running directory, payment rail, and trust
                layer that endpoints actually connect to. Other institutions can implement PSR-compatible nodes on
                their own infrastructure and connect back to PDC for discovery and payment routing, the same way a
                country implements X-Road rather than depending on Estonia to run it for them.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">Why a registry, not a marketplace</h2>
              <p className="text-base text-gray-700 leading-relaxed">
                The PSR answers a service-oriented-architecture problem specific to Pacific public institutions:
                ministries, universities, and regional bodies each hold data of value to others, but have no shared
                way to discover each other&apos;s services or settle payment across organisational boundaries without
                a pre-negotiated contract. A PSR-compatible endpoint solves both at once — it is discoverable by any
                compliant client, and payable per query over the same x402 rail every other PDC endpoint uses.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">Specification and schema</h2>
              <ul className="list-disc pl-5 space-y-1 text-base text-gray-700">
                <li>
                  <a href={PSR_SPEC_URL} className="text-ocean hover:underline" download>
                    PSR specification (spec.json)
                  </a>{" "}
                  — what the registry is, its version, and how to connect to it.
                </li>
                <li>
                  <a href={PSR_SCHEMA_URL} className="text-ocean hover:underline" download>
                    PSR endpoint schema (endpoint-schema.json)
                  </a>{" "}
                  — the field-by-field definition of a valid PSR-compatible endpoint registration.
                </li>
              </ul>
              <p className="text-sm text-gray-500 mt-2">
                Both documents are also served live from the directory API at{" "}
                <code className="text-sm bg-light-bg px-1.5 py-0.5 rounded">GET /psr/v1/spec</code> and{" "}
                <code className="text-sm bg-light-bg px-1.5 py-0.5 rounded">GET /psr/v1/schema</code> — public,
                unauthenticated, no payment required.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">Getting started</h2>
              <p className="text-base text-gray-700">
                For the agent-side quickstart (quotes, payment, response format), see the main{" "}
                <Link href="/developers" className="text-ocean hover:underline">
                  Developer Quickstart
                </Link>
                . Pacific institutions wishing to register a PSR-compatible endpoint should read the endpoint schema
                above and contact{" "}
                <a href="mailto:anthony@synergybcpacific.com" className="text-ocean hover:underline">
                  anthony@synergybcpacific.com
                </a>{" "}
                for onboarding.
              </p>
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
