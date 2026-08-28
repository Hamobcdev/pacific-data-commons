import { getResumedProvider } from "@/lib/onboarding/resume";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { GlobalFooter } from "@/components/nav/GlobalFooter";
import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { InstitutionalPanel } from "@/components/register/InstitutionalPanel";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PsrDisclosure } from "./PsrDisclosure";

/**
 * Session 37A — repurposed from the Session 19 three-path chooser into the
 * "/for-providers" landing page (served at this same /welcome URL; the
 * /for-providers slug redirects here, see next.config.mjs). Same (public)
 * inline three-column scaffold as ../developers/page.tsx — this group has
 * no shared layout.tsx (see that page's own doc comment).
 *
 * GlobalNav gets a real resolved provider (not null) — unchanged from the
 * previous version of this page: a signed-in provider landing here should
 * see their own dashboard/sign-out links, not the guest nav.
 *
 * All body copy below is hardcoded English, not i18n — matches the
 * established pattern on ../developers/page.tsx and
 * ../developers/psr/page.tsx (Decision 9's i18n stubs cover UI chrome only,
 * not long-form marketing/technical prose).
 */
export default async function WelcomePage() {
  const provider = await getResumedProvider();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <GlobalNav provider={provider} />
      <HeaderBand>
        <div className="flex items-end h-full px-6 pb-3">
          <h2 className="text-white text-lg font-semibold">For Providers</h2>
        </div>
      </HeaderBand>

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-4xl px-6 py-10 space-y-12">
            {/* Above the fold */}
            <section>
              <h1 className="text-3xl font-bold text-navy leading-tight">Your data. Your infrastructure. Your earnings.</h1>
              <p className="mt-4 text-lg text-gray-700 leading-relaxed max-w-2xl">
                Pacific institutions list data endpoints on the Pacific Data Commons and receive 97% of every query
                payment directly to their Algorand wallet. Your data stays on your own servers. SBP routes payments
                and provides the trust infrastructure.
              </p>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link href="/onboarding/register">
                  <Button type="button" className="w-full sm:w-auto min-h-[44px] px-6">
                    Start Registration
                  </Button>
                </Link>
                <a href="#how-it-works">
                  <Button type="button" variant="secondary" className="w-full sm:w-auto min-h-[44px] px-6">
                    How it works
                  </Button>
                </a>
              </div>
            </section>

            {/* PSR inline expandable — client component for the collapse state */}
            <PsrDisclosure />

            {/* Three-column section */}
            <section id="how-it-works" className="scroll-mt-16">
              <div className="grid gap-6 sm:grid-cols-3">
                <div>
                  <h3 className="text-base font-semibold text-navy border-b border-gray-200 pb-2 mb-3">What you receive</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                    <li>97% of every query payment, direct to your wallet</li>
                    <li>Provenance certificate on Algorand blockchain</li>
                    <li>Trust tier badge (Bronze, Silver, Gold)</li>
                    <li>Provider dashboard with earnings and endpoint health</li>
                    <li>Your data never leaves your infrastructure</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-navy border-b border-gray-200 pb-2 mb-3">What it costs</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                    <li>Free to register</li>
                    <li>Free to upload and list your data (currently — see note below)</li>
                    <li>3% of endpoint query revenue, invoiced monthly above $10 USDC</li>
                    <li>Deployment assistance available — see options below</li>
                  </ul>
                  <p className="mt-3 text-xs text-gray-500 bg-light-bg rounded-md p-3">
                    Pipeline assistance is currently free for all Pacific institutions. SBP earns when you earn — 3%
                    of query revenue. We will notify all registered providers before any pricing changes.
                  </p>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-navy border-b border-gray-200 pb-2 mb-3">Who can register</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                    <li>Pacific universities and research institutions</li>
                    <li>Government ministries and agencies</li>
                    <li>Regional bodies (SPREP, SPC, USP and affiliates)</li>
                    <li>NGOs and cultural institutions with Pacific data</li>
                    <li>Any institution with data of commercial or research value to external buyers and AI agents</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Deployment options */}
            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">Deployment options</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col rounded-lg border border-gray-200 p-5">
                  <h3 className="text-base font-semibold text-navy">Self-service (Free)</h3>
                  <p className="mt-1 text-sm font-medium text-gray-500">Implement it yourself</p>
                  <p className="mt-3 text-sm text-gray-700 leading-relaxed flex-1">
                    Clone the endpoint template, add your data, deploy to your own infrastructure, paste your live URL
                    into your dashboard. SBP registers your endpoint in the directory and issues your first
                    provenance certificate.
                  </p>
                  <a
                    href="https://github.com/Hamobcdev/pdc-endpoint-template"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 text-sm text-ocean hover:underline"
                  >
                    Endpoint template on GitHub →
                  </a>
                  <Link href="/onboarding/register" className="mt-4">
                    <Button type="button" variant="secondary" className="w-full min-h-[44px]">
                      Start Registration
                    </Button>
                  </Link>
                </div>

                <div className="flex flex-col rounded-lg border border-gray-200 p-5">
                  <h3 className="text-base font-semibold text-navy">SBP Assisted (Free — limited time)</h3>
                  <p className="mt-1 text-sm font-medium text-gray-500">We handle the technical work</p>
                  <p className="mt-3 text-sm text-gray-700 leading-relaxed flex-1">
                    SBP structures your data, deploys your endpoint, tests it with a live query, registers it in the
                    directory, and issues your provenance certificate. Currently free. Standard price $25 USDC when
                    reintroduced.
                  </p>
                  <p className="mt-3 text-xs text-gray-500">
                    Suitable for: clean, single-topic datasets in one of the 21 PDC data categories. Complex or
                    multi-dataset deployments are quoted separately — contact SBP first.
                  </p>
                  <Link href="/onboarding/register" className="mt-4">
                    <Button type="button" className="w-full min-h-[44px]">
                      Start Registration
                    </Button>
                  </Link>
                </div>

                <div className="flex flex-col rounded-lg border border-gray-200 p-5">
                  <h3 className="text-base font-semibold text-navy">Complex deployment</h3>
                  <p className="mt-1 text-sm font-medium text-gray-500">Multiple datasets or custom integration</p>
                  <p className="mt-3 text-sm text-gray-700 leading-relaxed flex-1">
                    Cultural data with sovereignty flags, multiple datasets, existing API integration, or government
                    systems requiring OGIP connection. Contact SBP before starting registration to scope the
                    engagement.
                  </p>
                  <a
                    href="mailto:anthony@synergybcpacific.com?subject=PDC%20complex%20deployment%20enquiry"
                    className="mt-4"
                  >
                    <Button type="button" variant="secondary" className="w-full min-h-[44px]">
                      Contact SBP
                    </Button>
                  </a>
                </div>
              </div>
            </section>

            {/* Government institutions */}
            <section className="rounded-lg bg-light-bg p-6">
              <h2 className="text-xl font-bold text-navy mb-3">For Government Ministries</h2>
              <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                <p>
                  Government ministries connect their existing data infrastructure directly. Your data is hosted on
                  your own government servers — PDC routes queries and payments. You receive USDC per query, direct
                  to your institution&apos;s wallet.
                </p>
                <p>
                  The wallet registered must be an institutional wallet controlled by an authorised financial
                  officer — not a personal wallet. Every query payment on your ministry&apos;s endpoints goes
                  directly to this wallet.
                </p>
                <p>
                  PDC does not require you to change how your data is stored or managed. We list your endpoint,
                  verify your institution&apos;s identity, and route payments. That is all.
                </p>
              </div>

              <Link href="/onboarding/register?track=government" className="mt-5 inline-block">
                <Button type="button" className="min-h-[44px] px-6">
                  Government Registration
                </Button>
              </Link>
              <p className="mt-2 text-xs text-gray-500">
                Government registration follows the same steps as institutional registration. Select &quot;Government
                Ministry or Agency&quot; as your institution type and the registration form will guide you through
                any additional fields.
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
