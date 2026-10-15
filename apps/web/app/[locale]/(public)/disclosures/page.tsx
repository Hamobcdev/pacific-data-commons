"use client";

import { useState } from "react";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { GlobalFooter } from "@/components/nav/GlobalFooter";
import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { InstitutionalPanel } from "@/components/register/InstitutionalPanel";

// Disclosures page — five required sections per brief, plus a lead-capture
// form at the foot. Content is hardcoded English (same approach as FAQ and
// the finance office brief). No i18n namespace needed for content; surrounding
// chrome labels match the footer link text directly.
//
// "use client" is required for the form submission state (useState).
// All layout components above are server-compatible and render fine inside
// a client component.

export default function DisclosuresPage() {
  const [formState, setFormState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [form, setForm] = useState({ name: "", email: "", organisation: "", message: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState("submitting");
    try {
      const res = await fetch("/api/disclosures/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setFormState("success");
      } else {
        setFormState("error");
      }
    } catch {
      setFormState("error");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <GlobalNav provider={null} />

      <HeaderBand>
        <div className="flex items-end h-full px-6 pb-3">
          <h1 className="text-white text-lg font-semibold">Disclosures</h1>
        </div>
      </HeaderBand>

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-3xl px-6 py-10 space-y-10">

            {/* Section 1 */}
            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-5">
                Platform Role
              </h2>
              <p className="text-base text-gray-700 leading-relaxed">
                Pacific Data Commons is a directory and payment infrastructure operator only. Synergy Blockchain
                Pacific (SBP) is not a data processor, quality assessor, financial intermediary, or dispute
                arbitrator. SBP verifies provider identity and records community ratings — it makes no quality
                judgments about any data listed on the platform. All disputes are between the data provider and
                the buyer directly. SBP is not a party to any provider-buyer transaction.
              </p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-5">
                Regulatory Intelligence Service
              </h2>
              <p className="text-base text-gray-700 leading-relaxed">
                Samoa Jurisdiction Intelligence endpoints provide structured, machine-readable summaries of
                publicly available regulatory frameworks for Samoa&apos;s international financial services sector.
                Data is sourced from official publications (SIFA, samoaibfc.ws, FATF, PacLII) and reflects the
                regulatory position at the date stated in each endpoint response.
              </p>
              <p className="mt-4 text-base text-gray-700 leading-relaxed">
                Pacific Data Commons is not a law firm and does not provide legal advice. Information provided
                does not constitute legal, financial, or compliance advice. Users must verify current
                requirements directly with the relevant regulatory authority before making any decisions based
                on this data.
              </p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-5">
                Government Processes and Case-by-Case Decisions
              </h2>
              <p className="text-base text-gray-700 leading-relaxed">
                Regulatory frameworks described on this platform represent general published requirements.
                Pacific Island governments and their ministries retain the right to make independent,
                case-by-case decisions on individual applications at any time. Processing timelines,
                requirements, and outcomes may vary between applicants.
              </p>
              <p className="mt-4 text-base text-gray-700 leading-relaxed">
                Government officials may request additional information, impose additional conditions, or
                decline applications at their discretion regardless of published frameworks. Pacific Data
                Commons makes no representation regarding the outcome of any individual application or
                regulatory interaction.
              </p>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-5">
                Commercial Relationships
              </h2>
              <p className="text-base text-gray-700 leading-relaxed">
                Pacific Data Commons lists regulated service providers (trustee companies, law firms, licensed
                institutions) as factual directory information only. Listing does not constitute an
                endorsement, referral, or recommendation by SBP or Pacific Data Commons. SBP has no commercial
                referral relationship with any listed service provider. Users engage service providers entirely
                at their own discretion.
              </p>
            </section>

            {/* Section 5 — Contact + lead form */}
            <section className="bg-light-bg rounded-xl p-6">
              <h2 className="text-lg font-bold text-navy mb-2">Contact and Enquiries</h2>
              <p className="text-gray-600 text-base mb-6">
                For enquiries about Pacific Data Commons, partnership opportunities, or data provider
                registration, use the form below.
              </p>

              {formState === "success" ? (
                <div className="rounded-lg bg-green-50 border border-green-200 px-5 py-4 text-green-800 text-sm font-medium">
                  Thank you — we&apos;ll be in touch.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={200}
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean/40 focus:border-ocean"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        maxLength={200}
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean/40 focus:border-ocean"
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Organisation
                    </label>
                    <input
                      type="text"
                      maxLength={200}
                      value={form.organisation}
                      onChange={(e) => setForm((f) => ({ ...f, organisation: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean/40 focus:border-ocean"
                      placeholder="Your organisation (optional)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Message <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      maxLength={500}
                      rows={4}
                      value={form.message}
                      onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean/40 focus:border-ocean resize-none"
                      placeholder="Your message..."
                    />
                  </div>

                  {formState === "error" && (
                    <p className="text-sm text-red-600">
                      Something went wrong — please try again or email anthony@synergybcpacific.com directly.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={formState === "submitting"}
                    className="inline-block px-5 py-2.5 bg-ocean text-white rounded-lg text-sm font-medium hover:bg-navy transition-colors disabled:opacity-60"
                  >
                    {formState === "submitting" ? "Sending…" : "Send Enquiry"}
                  </button>
                </form>
              )}
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
