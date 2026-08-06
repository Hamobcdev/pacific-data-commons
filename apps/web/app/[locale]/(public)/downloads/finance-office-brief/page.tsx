import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { InstitutionalPanel } from "@/components/register/InstitutionalPanel";
import { GlobalFooter } from "@/components/nav/GlobalFooter";

// Resolves the previous /downloads/finance-office-brief.pdf 404 (Session
// 11) — a static PDF was never generated, so this renders the same brief
// as a normal page instead; browsers can print it to PDF if a physical/
// offline copy is needed. Linked from WalletForm's custody guidance.
//
// This page lives in the (public) route group, which has no shared layout
// (the landing page next to it deliberately stays full-bleed chrome-free),
// so the Session 12 fix three-column scaffold is built inline here rather
// than via a layout.tsx that would also apply to the landing page.
export default function FinanceOfficeBriefPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <HeaderBand />

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        {/* `<main>` moved to this wrapper — it's the page's one landmark
            now that this used to be a lone top-level <main>. The original
            classes are preserved unchanged on the inner div below. */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-12 font-sans">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-navy mb-1">Pacific Data Commons</h1>
              <h2 className="text-lg text-gray-600">Institutional Wallet Setup Guide</h2>
              <p className="text-sm text-gray-400 mt-1">For Finance and IT Departments</p>
            </div>

            <section className="mb-6">
              <h3 className="font-semibold text-navy mb-2">What is this wallet for?</h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Your institution will receive USDC payments directly to this Algorand wallet each time an AI agent or
                researcher queries your data endpoint. This wallet should be controlled by your Finance or IT
                department — not a personal device.
              </p>
            </section>

            <section className="mb-6">
              <h3 className="font-semibold text-navy mb-2">What is USDC?</h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                USDC is a USD-pegged digital currency. 1 USDC = 1 USD at all times. It is held in your Algorand
                blockchain wallet. It is not automatically convertible to local currency — your institution holds it
                as a digital asset until a conversion pathway is available. SBP is actively consulting with the
                Central Bank of Samoa on the regulatory pathway.
              </p>
            </section>

            <section className="mb-6">
              <h3 className="font-semibold text-navy mb-2">What is Algorand?</h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Algorand is a public blockchain used for fast, low-cost digital payments. Your wallet address is a
                58-character string that uniquely identifies your institution&apos;s payment destination.
              </p>
            </section>

            <section className="mb-6">
              <h3 className="font-semibold text-navy mb-2">Recommended wallet setup</h3>
              <ol className="list-decimal list-inside text-sm text-gray-700 leading-relaxed space-y-2">
                <li>Install Pera Wallet on an institutional device (iOS or Android)</li>
                <li>Create a new wallet — do NOT use a personal wallet</li>
                <li>
                  Store the 25-word seed phrase in a secure, offline location (e.g. a physical safe or institutional
                  key management system)
                </li>
                <li>Opt in to USDC (ASA 31566704) — requires approximately 0.3 ALGO</li>
                <li>Contact SBP at anthony@synergybcpacific.com for your complimentary 0.5 ALGO onboarding credit</li>
              </ol>
            </section>

            <section className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="font-semibold text-amber-800 mb-2">Security note</h3>
              <p className="text-amber-700 text-sm leading-relaxed">
                SBP cannot recover your wallet if the seed phrase is lost. Treat the seed phrase like the deed to a
                building.
              </p>
            </section>

            <section className="text-sm text-gray-500 border-t pt-6">
              <p>
                Questions? Contact:{" "}
                <a href="mailto:anthony@synergybcpacific.com" className="text-ocean underline">
                  anthony@synergybcpacific.com
                </a>
              </p>
              <p className="mt-1">Web: synergybcpacific.com</p>
              <p className="mt-1">
                Pacific Data Commons is a pre-commercial pilot operated by Synergy Blockchain Pacific Limited, Apia,
                Samoa.
              </p>
            </section>
          </div>
        </main>

        <aside
          className="hidden xl:flex flex-col flex-shrink-0 w-48 2xl:w-56
            sticky top-0 h-screen overflow-hidden border-l border-gray-100"
        >
          <InstitutionalPanel />
        </aside>
      </div>

      <GlobalFooter />
    </div>
  );
}
