export interface ComplexCardProps {
  institutionName: string;
}

/** Card 3 — complex deployment (Session 37B). Mailto only — no invoice is
 * created, contact happens outside the platform (per the build prompt's
 * explicit instruction). */
export function ComplexCard({ institutionName }: ComplexCardProps) {
  const subject = encodeURIComponent(`PDC complex deployment — ${institutionName}`);

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-navy">Multiple datasets or custom integration</h3>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">Contact SBP first</span>
      </div>

      <p className="mt-3 text-sm text-gray-700 leading-relaxed flex-1">
        Cultural data with sovereignty flags, multiple datasets, existing API integration, or government ministry
        systems. Contact SBP before starting to scope the engagement and agree pricing.
      </p>

      <a href={`mailto:anthony@synergybcpacific.com?subject=${subject}`} className="mt-4">
        <button
          type="button"
          className="w-full min-h-[44px] rounded-md border border-navy/30 bg-white px-4 py-2 text-sm font-medium text-navy hover:bg-light-bg"
        >
          Contact SBP
        </button>
      </a>
    </div>
  );
}
