import { GlobalNav } from "@/components/nav/GlobalNav";
import { GlobalFooter } from "@/components/nav/GlobalFooter";
import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { InstitutionalPanel } from "@/components/register/InstitutionalPanel";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

/** Rendered three times per Session 37A's brief — one component so the
 * mandatory wording can't drift between occurrences. */
function SeedPhraseCaveat() {
  return (
    <Alert variant="warning">
      <p className="font-semibold">⚠ Never share your seed phrase or private key with anyone — including support staff.</p>
      <p className="mt-2">
        Anyone contacting you offering help without you requesting it is a scammer. Official Pera support is only at{" "}
        <a
          href="https://support.perawallet.app"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          support.perawallet.app
        </a>
        . Even there: never give your seed phrase. If your seed phrase has been seen by anyone else, treat the wallet
        as compromised immediately and move all funds to a new wallet before doing anything else.
      </p>
    </Alert>
  );
}

/**
 * Session 37A — new page, no prior equivalent. Same (public) inline
 * three-column scaffold as ../../developers/page.tsx and ../../welcome/page.tsx
 * (this route group has no shared layout.tsx). GlobalNav gets provider={null}
 * — this is an unauthenticated reference document, same posture as
 * ../../downloads/finance-office-brief/page.tsx.
 */
export default function WalletSetupGuidePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <GlobalNav provider={null} />
      <HeaderBand>
        <div className="flex items-end h-full px-6 pb-3">
          <h1 className="text-white text-lg font-semibold">Wallet Setup Guide</h1>
        </div>
      </HeaderBand>

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-3xl px-6 py-10 space-y-10">
            <section>
              <p className="text-lg text-gray-700">
                Setting up your institution&apos;s Algorand wallet to receive USDC payments.
              </p>
            </section>

            <SeedPhraseCaveat />

            {/* Section 1 */}
            <section className="rounded-lg bg-light-bg p-5">
              <h2 className="text-xl font-bold text-navy mb-3">Before you start</h2>
              <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                <p>
                  The wallet you register must be an institutional wallet — not a personal wallet. Every query
                  payment on your institution&apos;s endpoints goes directly to this wallet. The person who sets up
                  and controls this wallet should be your designated data officer or financial controller, with a
                  documented handover procedure if that person leaves the institution.
                </p>
                <p>
                  If you are unsure whether your institution has the authority or internal processes to receive
                  digital currency payments, read the{" "}
                  <Link href="/downloads/finance-office-brief" className="text-ocean hover:underline">
                    Institutional Wallet Brief →
                  </Link>{" "}
                  before proceeding.
                </p>
              </div>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">Your options</h2>
              <p className="text-sm text-gray-700 leading-relaxed mb-5">
                There are two main wallet options for Pacific institutions. Most institutions start with a software
                wallet (Pera) and move to a hardware wallet when query earnings reach a level that warrants stronger
                security.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="text-base font-semibold text-navy">Software wallet (Pera)</h3>
                  <dl className="mt-3 space-y-2 text-sm text-gray-700">
                    <div>
                      <dt className="font-medium text-gray-500">Best for</dt>
                      <dd>Getting started, institutions with limited IT support.</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500">Security</dt>
                      <dd>
                        Your seed phrase is the only backup — store it on paper, not digitally. If lost, the wallet
                        cannot be recovered.
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500">Cost</dt>
                      <dd>Free.</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500">Recommended for</dt>
                      <dd>Initial registration and first earnings.</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="text-base font-semibold text-navy">Hardware wallet (Ledger + Pera)</h3>
                  <dl className="mt-3 space-y-2 text-sm text-gray-700">
                    <div>
                      <dt className="font-medium text-gray-500">Best for</dt>
                      <dd>
                        Institutions where the wallet will hold significant value (above approximately $500 USDC
                        equivalent) or where multiple staff need supervised access.
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500">Security</dt>
                      <dd>
                        Your seed phrase is stored on the Ledger device, not on your phone or computer. Much harder
                        to lose to phishing or malware.
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500">Cost</dt>
                      <dd>
                        Ledger hardware device (~$80–$150 USD, purchased from{" "}
                        <a
                          href="https://www.ledger.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ocean hover:underline"
                        >
                          ledger.com
                        </a>{" "}
                        directly — never from a third party).
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500">Recommended for</dt>
                      <dd>Government ministries, universities, any institution with ongoing query revenue.</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">Setting up Pera (software wallet)</h2>

              <ol className="space-y-6">
                <li>
                  <h3 className="text-base font-semibold text-navy">Step 1: Download Pera Wallet</h3>
                  <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                    Download the official Pera Wallet app from the Apple App Store or Google Play Store. Search for
                    &quot;Pera Wallet&quot; — the developer is Pera Technology. Do not download from any other
                    source.
                  </p>
                </li>
                <li>
                  <h3 className="text-base font-semibold text-navy">Step 2: Create a new wallet</h3>
                  <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                    Open Pera and select &quot;Create a new wallet&quot;. Pera will generate a 25-word seed phrase.
                    This is the only key to your wallet.
                  </p>
                </li>
                <li>
                  <h3 className="text-base font-semibold text-navy">Step 3: Write down your seed phrase — now, on paper</h3>
                  <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                    Write every word, in order, on paper. Do not photograph it. Do not type it into any app, cloud
                    document, or messaging service. Store the paper in a secure location — treat it as you would
                    treat the deed to a building. SBP cannot recover your wallet if this phrase is lost.
                  </p>
                  <div className="mt-3">
                    <SeedPhraseCaveat />
                  </div>
                </li>
                <li>
                  <h3 className="text-base font-semibold text-navy">Step 4: Verify your seed phrase</h3>
                  <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                    Pera will ask you to confirm your seed phrase by selecting words in order. Complete this step
                    before proceeding.
                  </p>
                </li>
                <li>
                  <h3 className="text-base font-semibold text-navy">Step 5: Opt into USDC</h3>
                  <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                    Your wallet must opt into USDC before it can receive payments. In Pera: tap the &quot;+&quot;
                    icon → search for &quot;USDC&quot; → select the asset with ID 31566704 → confirm the opt-in. This
                    costs approximately 0.1 ALGO. SBP will send 0.5 ALGO to your wallet address after your
                    institution is verified — this covers the opt-in cost.
                  </p>
                </li>
                <li>
                  <h3 className="text-base font-semibold text-navy">Step 6: Copy your wallet address</h3>
                  <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                    Tap your wallet name at the top of the Pera home screen. Your Algorand wallet address is the long
                    string of letters and numbers (58 characters). Copy it — this is what you paste into Step 2 of
                    PDC registration. It is safe to share this address.
                  </p>
                </li>
              </ol>

              <div className="mt-6 space-y-1 text-sm">
                <a
                  href="https://support.perawallet.app/en/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-ocean hover:underline"
                >
                  Official Pera support →
                </a>
                <a
                  href="https://www.youtube.com/@PeraWalletApp/videos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-ocean hover:underline"
                >
                  Pera setup video tutorials →
                </a>
              </div>

              <div className="mt-3">
                <Alert variant="warning">
                  These are official Pera resources. Never share your seed phrase or private key with anyone on these
                  pages or anywhere else.
                </Alert>
              </div>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">
                Setting up a hardware wallet (Ledger + Pera)
              </h2>
              <p className="text-sm text-gray-700 leading-relaxed mb-4">
                If your institution requires hardware-level security, a Ledger device connected to Pera provides the
                strongest available protection for an Algorand wallet.
              </p>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 leading-relaxed">
                <li>
                  Purchase a Ledger Nano S Plus or Ledger Nano X from ledger.com directly. Never buy a Ledger from a
                  third-party seller — devices can be pre-configured by bad actors.
                </li>
                <li>
                  Set up your Ledger using the official Ledger Live app. Write down your seed phrase on paper exactly
                  as in Section 3 above.
                </li>
                <li>Install the Algorand app on your Ledger via Ledger Live.</li>
                <li>Open Pera on your phone and select &quot;Connect Ledger&quot;.</li>
                <li>Follow the Pera + Ledger connection instructions in the official Pera support documentation.</li>
                <li>
                  Opt into USDC as described in Section 3, Step 5 — the Ledger device will prompt you to confirm the
                  opt-in on-device.
                </li>
              </ol>
              <p className="mt-4 text-sm text-gray-500">
                Hardware wallet setup requires more time and technical confidence. If your IT team needs assistance,
                contact SBP at{" "}
                <a href="mailto:anthony@synergybcpacific.com" className="text-ocean hover:underline">
                  anthony@synergybcpacific.com
                </a>{" "}
                before starting registration.
              </p>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">Acquiring USDC and ALGO</h2>
              <p className="text-sm text-gray-700 leading-relaxed mb-5">
                Your wallet needs ALGO to operate (for transaction fees and opt-in costs) and will accumulate USDC as
                institutions query your endpoints. Here is how to acquire each.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-navy">A. ALGO (for transaction fees)</h3>
                  <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                    SBP sends 0.5 ALGO to your wallet after your institution is verified during registration. This
                    covers your USDC opt-in cost and initial transaction fees. You do not need to purchase ALGO to
                    get started.
                  </p>
                  <p className="mt-2 text-sm text-gray-700 leading-relaxed">
                    For ongoing operations, ALGO can be purchased on international exchanges including Binance,
                    Kraken, and Coinbase. Pacific exchange availability varies — check whether your country&apos;s
                    regulations permit exchange use.
                  </p>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-navy">B. USDC (for paying queries or receiving earnings)</h3>
                  <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                    USDC accumulates in your wallet automatically as buyers query your endpoints. You do not need to
                    purchase USDC to register as a provider.
                  </p>
                  <p className="mt-2 text-sm text-gray-700 leading-relaxed">
                    If you want to use USDC to pay for queries yourself (as a buyer of other PDC endpoints), options
                    include:
                  </p>
                  <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-gray-700">
                    <li>Purchase USDC directly on exchanges that support it (availability varies by country)</li>
                    <li>
                      Purchase ALGO and swap to USDC on{" "}
                      <a
                        href="https://tinyman.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ocean hover:underline"
                      >
                        Tinyman
                      </a>{" "}
                      — the primary Algorand decentralised exchange
                    </li>
                    <li>Peer-to-peer from another institution or individual who holds USDC</li>
                  </ul>
                </div>

                <div className="rounded-lg bg-light-bg p-5">
                  <h3 className="text-base font-semibold text-navy">C. What you can do with your USDC earnings</h3>
                  <p className="mt-2 text-sm text-gray-700 leading-relaxed">
                    USDC is a USD-pegged digital currency. 1 USDC equals 1 USD in value. Your options for accessing
                    the value of your earnings:
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-gray-700">
                    <li>✓ Hold as institutional digital treasury — USDC in your wallet retains its USD value and can be used at any time.</li>
                    <li>✓ Pay for queries on PDC — use your earnings wallet to query other Pacific endpoints or run AI agents.</li>
                    <li>✓ Purchase services — SBP deployment assistance and other x402-compatible services can be paid in USDC.</li>
                    <li>✓ Exchange peer-to-peer — exchange with other institutions or individuals locally who want USDC.</li>
                    <li>✓ Exchange via international bank account — exchange on international exchanges using an overseas bank account where available.</li>
                  </ul>
                  <p className="mt-3 text-sm text-gray-700 leading-relaxed font-medium">
                    Current limitation: No regulated USDC-to-fiat exchange pathway exists in Samoa or most Pacific
                    nations. Synergy Blockchain Pacific is in active consultation with the Central Bank of Samoa on a
                    regulatory pathway. We will notify all registered providers when a local conversion option
                    becomes available. Do not rely on immediate fiat conversion when planning your institution&apos;s
                    data monetisation.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">Financial controls for institutions</h2>
              <p className="text-sm text-gray-700 leading-relaxed mb-4">
                Before registering, your institution should have a clear answer to each of these questions:
              </p>

              <div className="space-y-5 text-sm text-gray-700 leading-relaxed">
                <div>
                  <h3 className="font-semibold text-navy">Who controls the wallet?</h3>
                  <p className="mt-1">
                    The wallet must be held by a designated data officer or financial controller — a named role, not
                    a named individual. Your institution should have a documented procedure for what happens when
                    that person leaves.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-navy">Does your institution have authority to receive digital currency payments?</h3>
                  <p className="mt-1">
                    This depends on your institution&apos;s financial regulations and any donor or government funding
                    conditions. Check with your finance team before registering. The{" "}
                    <Link href="/downloads/finance-office-brief" className="text-ocean hover:underline">
                      Institutional Wallet Brief →
                    </Link>{" "}
                    is a one-page document designed for your finance office.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-navy">What is your institution&apos;s spending policy for USDC earnings?</h3>
                  <p className="mt-1">
                    Earnings accumulate in the wallet. Your institution should decide in advance: who can authorise
                    spending, what USDC can be used for, and how earnings are reported in institutional accounts.
                    This is your governance decision — SBP does not have visibility into or control over your
                    wallet.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-navy">Multi-signature wallets</h3>
                  <p className="mt-1">
                    Algorand supports multi-signature wallets that require approval from multiple keyholders before
                    any transaction. This is appropriate for institutions where financial controls require dual
                    authorisation. Multi-sig setup is more complex — contact SBP if your institution requires this
                    configuration and we can point you to the right resources.
                  </p>
                </div>
              </div>
            </section>

            {/* Footer CTA */}
            <section className="border-t border-gray-200 pt-8 text-center">
              <p className="text-base text-gray-700 mb-4">Ready to register your institution?</p>
              <Link href="/onboarding/register">
                <Button type="button" className="min-h-[44px] px-6">
                  Start Registration
                </Button>
              </Link>
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
