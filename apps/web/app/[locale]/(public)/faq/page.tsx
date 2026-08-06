import { getTranslations } from "next-intl/server";
import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { InstitutionalPanel } from "@/components/register/InstitutionalPanel";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { GlobalFooter } from "@/components/nav/GlobalFooter";

// This page lives in the (public) route group, which has no shared layout
// (same reasoning as the finance office brief next to it) — the three-column
// scaffold is built inline here. GlobalNav gets `provider={null}`
// unconditionally: the FAQ is reachable from both guest and authenticated
// nav, but this page itself has no auth-gated content and doesn't need its
// own auth lookup.
//
// The 20 question/answer pairs below stay hardcoded English JSX rather than
// i18n keys — same choice the finance office brief page next to it already
// made for its long-form content. Only the surrounding chrome (title,
// contact block) uses the Faq i18n namespace, since those four strings map
// directly onto real page elements.
export default async function FaqPage() {
  const t = await getTranslations("Faq");

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <GlobalNav provider={null} />

      <HeaderBand>
        <div className="flex items-end h-full px-6 pb-3">
          <h1 className="text-white text-lg font-semibold">{t("title")}</h1>
        </div>
      </HeaderBand>

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-3xl px-6 py-10 space-y-10">
            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-6">
                Understanding Pacific Data Commons
              </h2>

              <FaqItem question="What is Pacific Data Commons?">
                Pacific Data Commons (PDC) is a digital marketplace where Pacific institutions — universities,
                government ministries, research agencies — can list their data and earn direct payments when AI
                agents or researchers query it. Your data stays on your own servers at all times. SBP never stores,
                copies, or controls your data.
              </FaqItem>

              <FaqItem question="What does SBP do, and what does SBP NOT do?">
                SBP is the directory and payment infrastructure only. SBP verifies your institution&apos;s identity,
                lists your data in the directory, and routes payments from buyers directly to your wallet. SBP does
                not store your data, assess its quality, arbitrate disputes between you and buyers, or hold your
                money at any point. 97% of every payment goes directly to your Algorand wallet. SBP earns 3% as an
                infrastructure fee.
              </FaqItem>

              <FaqItem question="Who can register as a data provider?">
                Any Pacific institution with a verifiable institutional email address and a data endpoint they own
                can register. This includes universities, government ministries, research agencies, NGOs, and
                regional bodies. Individual researchers cannot register — institutions only.
              </FaqItem>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-6">
                Understanding Each Page
              </h2>

              <FaqItem question="What is the Provider Dashboard?">
                The Provider Dashboard is your institution&apos;s home page after registration. It shows your PDC
                wallet balance (how much USDC you have earned), your recent queries (which agents or researchers
                have accessed your data and when), your trust tier progress (Bronze, Silver, Gold), and your active
                data endpoints. Think of it as your institution&apos;s earnings and analytics centre.
              </FaqItem>

              <FaqItem question="What is the Agent Marketplace?">
                The Agent Marketplace is where AI agents are listed that can query Pacific data on behalf of users.
                These agents are pre-built tools that combine data from multiple PDC endpoints to answer specific
                questions — for example, the Pacific Fisheries Status agent queries ocean temperature data and
                fisheries catch data together to give a more complete picture than either dataset alone.
              </FaqItem>

              <FaqItem question="When I click 'Run Agent' — what is actually happening?">
                When you run an agent, the agent queries one or more data endpoints listed in the PDC directory.
                Each query triggers a small USDC payment from your wallet to the data provider&apos;s wallet — this
                happens automatically via the Algorand blockchain. You pay a small per-query fee (shown on the agent
                card) and receive a formatted report or data response. You are the buyer in this transaction. If you
                are also a data provider, your own earnings from others querying your data are separate from what
                you spend running agents.
              </FaqItem>

              <FaqItem question="What is the 'Add Dataset' page?">
                Add Dataset is where you upload a new dataset to the PDC directory. This walks you through the same
                7-step onboarding process used for your first dataset, but skips the registration and wallet setup
                steps since your institution is already verified. You can add as many datasets as you have data for.
              </FaqItem>

              <FaqItem question="What is 'Wallet Settings'?">
                Wallet Settings takes you to the wallet setup page where you can review your Algorand wallet address,
                check your USDC opt-in status, and access the wallet setup guide. Your wallet address is where all
                your earnings are sent — it is worth checking occasionally to confirm it is correct.
              </FaqItem>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-6">Getting Paid</h2>

              <FaqItem question="How does my institution get paid?">
                Every time an AI agent or researcher queries your data endpoint, a USDC payment is sent
                automatically from their wallet to your Algorand wallet. This happens on the Algorand blockchain —
                there is no invoice, no bank transfer, and no waiting period. Payments arrive within seconds.
              </FaqItem>

              <FaqItem question="What is USDC?">
                USDC is a digital currency pegged to the US dollar — 1 USDC always equals 1 USD. It is held in your
                Algorand blockchain wallet. It is not automatically convertible to local currency (WST, FJD, etc.) —
                your institution holds it as a digital asset. SBP is actively consulting with the Central Bank of
                Samoa on the regulatory pathway for USDC-to-local-currency conversion. We will notify all providers
                when this pathway becomes available.
              </FaqItem>

              <FaqItem question="What are the different pricing tiers (Tier 1 through Tier 5)?">
                When you list a dataset, you set a price for each access tier. Tier 1 is a brief summary (cheapest —
                typically $0.01). Tier 2 is a filtered data slice. Tier 3 is the complete dataset. Tier 4 is the full
                dataset plus methodology documentation. Tier 5 is a custom commissioned query where SBP and the
                provider work together directly with the buyer. You set your own prices — the platform suggests
                prices based on comparable datasets but you have full control.
              </FaqItem>

              <FaqItem question="What is the $0.01 directory query fee?">
                Every time someone searches the PDC directory (not a data query — just browsing the listings), a
                $0.01 USDC fee is charged. This small fee helps SBP cover operational costs and discourages
                automated scraping of the directory. You do not pay this fee — buyers pay it when they search.
              </FaqItem>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-6">Trust Tiers</h2>

              <FaqItem question="What is Bronze tier?">
                Bronze is the starting trust tier, awarded automatically when your institution is verified. It means
                SBP has confirmed your institution exists, your email domain matches your institution, and your
                Algorand wallet is valid. Bronze providers can list data and receive payments. Buyers see &ldquo;Identity
                Verified — Unrated&rdquo; for Bronze providers.
              </FaqItem>

              <FaqItem question="What is Silver tier?">
                Silver is earned when 3 different verified buyers have paid for a query from your endpoint and
                submitted a positive rating. This is community verification — SBP does not assess quality, buyers
                do. Silver tier removes the price cap on your listings and tells buyers your data has been
                independently used and rated. It is free to achieve.
              </FaqItem>

              <FaqItem question="What is Gold tier?">
                Gold is earned when your dataset has been formally peer reviewed and you submit the DOI (Digital
                Object Identifier) as evidence. SBP does a clerical check only — confirming the DOI resolves, the
                author name matches, and the paper references the dataset. SBP does not assess scientific quality.
                Gold tier costs $25 one-time and signals to buyers that your data meets academic peer review
                standards.
              </FaqItem>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-6">
                Your Data and Privacy
              </h2>

              <FaqItem question="Does SBP store or copy my data?">
                No. Your data stays on your own servers at all times. SBP only stores your metadata — the
                description, pricing, and provenance information you enter during onboarding. When a buyer queries
                your data, the query goes directly to your endpoint. SBP routes the payment but never sees the data.
              </FaqItem>

              <FaqItem question="Who can access my data?">
                Only buyers who pay the appropriate tier price can access your data. You set the price and the
                access conditions. You can also set sovereignty flags — for example, marking data as containing
                traditional ecological knowledge, which restricts certain types of commercial use. Buyers must
                acknowledge these flags before querying.
              </FaqItem>

              <FaqItem question="Can I update or remove my data listing?">
                Yes. You can update your metadata, pricing, and provenance information at any time through your
                provider dashboard. If you need to remove a listing, contact SBP at anthony@synergybcpacific.com —
                full endpoint removal is currently a manual process during the pilot period.
              </FaqItem>

              <FaqItem question="Can I register multiple datasets?">
                Yes. Use the &lsquo;Add Dataset&rsquo; link in the navigation to add additional datasets to your
                institution&apos;s account. Each dataset gets its own endpoint, its own pricing, and its own trust
                tier progression. Your wallet receives payments from all your datasets in one place.
              </FaqItem>

              <FaqItem question="Can I register two different organisations with the same email?">
                No — one email address is linked to one institution. This is a security measure to prevent the same
                contact from creating duplicate listings for the same institution. If you genuinely represent two
                separate institutions, use a different institutional email address for each registration. Contact
                SBP if you need assistance with this.
              </FaqItem>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-6">Technical Questions</h2>

              <FaqItem question="What is an Algorand wallet and why do I need one?">
                An Algorand wallet is a digital payment address — like a bank account number for the Algorand
                blockchain. You need one so that USDC payments from buyers can be sent directly to your institution.
                SBP recommends Pera Wallet (free, available on iOS and Android) for most institutions. SBP sends 0.5
                ALGO to your wallet to cover the initial setup costs — you do not need to purchase anything to get
                started.
              </FaqItem>

              <FaqItem question="What is x402 and why does it matter?">
                x402 is the payment protocol that PDC uses to enable per-query micropayments. When an AI agent sends
                a query to your endpoint, x402 automatically handles the payment verification and settlement — the
                agent pays, the payment is confirmed on the Algorand blockchain, and then the query is fulfilled.
                This happens in under a second. You do not need to understand or configure x402 — it works
                automatically once your endpoint is live.
              </FaqItem>

              <FaqItem question="What happens after I complete registration?">
                After completing all 7 registration steps, SBP reviews your submission within 2 business days. We
                verify your institution details, confirm your data endpoint is accessible, and activate your listing
                in the directory. You will receive an email when your endpoint is live and ready to receive queries.
              </FaqItem>
            </section>

            <section className="bg-light-bg rounded-xl p-6">
              <h2 className="text-lg font-bold text-navy mb-2">{t("contact")}</h2>
              <p className="text-gray-600 text-base mb-4">{t("contactBody")}</p>
              <a
                href="mailto:anthony@synergybcpacific.com"
                className="inline-block px-4 py-2 bg-ocean text-white rounded-lg text-base font-medium hover:bg-navy transition-colors"
              >
                {t("contactLink")}
              </a>
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

function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 pb-6 border-b border-gray-100 last:border-0">
      <h3 className="text-base font-semibold text-navy mb-2">{question}</h3>
      <p className="text-base text-gray-700 leading-relaxed">{children}</p>
    </div>
  );
}
