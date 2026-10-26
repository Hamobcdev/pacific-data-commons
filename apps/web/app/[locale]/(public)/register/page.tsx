import { createServiceClient } from "@/lib/supabase/server";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { GlobalFooter } from "@/components/nav/GlobalFooter";
import { RegistrationStepper } from "@/components/registration/RegistrationStepper";
import { NATION_CODE_VALUES } from "@/lib/tourism/providerFormSchema";

export const dynamic = "force-dynamic";

// Static fallback — matches the 13 rows seeded into tourism_destinations
// (supabase/migrations/20261026000001_pacific_tourism_schema.sql). Used
// only if the live query below fails, so this page never hard-fails on a
// transient DB hiccup (P8 — Pacific connectivity constraints).
const FALLBACK_NATION_NAMES: Record<string, string> = {
  WS: "Samoa",
  TO: "Tonga",
  FJ: "Fiji",
  VU: "Vanuatu",
  CK: "Cook Islands",
  NU: "Niue",
  PW: "Palau",
  PF: "French Polynesia",
  SB: "Solomon Islands",
  MH: "Marshall Islands",
  FM: "Federated States of Micronesia",
  KI: "Kiribati",
  PG: "Papua New Guinea",
};

export interface NationOption {
  nation_code: string;
  nation_name: string;
}

async function getNations(): Promise<NationOption[]> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.from("tourism_destinations").select("nation_code, nation_name").order("nation_name");
    if (error || !data || data.length === 0) {
      throw error ?? new Error("empty tourism_destinations result");
    }
    return data as NationOption[];
  } catch {
    return NATION_CODE_VALUES.map((code) => ({ nation_code: code, nation_name: FALLBACK_NATION_NAMES[code] ?? code })).sort((a, b) =>
      a.nation_name.localeCompare(b.nation_name),
    );
  }
}

/**
 * Phase C — Pacific Tourism Data Framework provider self-registration.
 * Anonymous, public, no dashboard link on completion. A focused conversion
 * funnel, not a content-browsing page — deliberately skips this app's
 * three-column (public) scaffold (HeaderBand/PacificSidePanel) used by
 * faq/developers/etc.
 */
export default async function RegisterPage() {
  const nations = await getNations();

  return (
    <div className="min-h-screen flex flex-col bg-light-bg">
      <GlobalNav provider={null} />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-navy mb-2">List Your Tourism Business</h1>
        <p className="text-sm text-gray-600 mb-8">
          Register your accommodation, tour, activity, transport, venue, or market stall on the Pacific Data Commons tourism
          directory. A one-time $10 registration fee applies.
        </p>
        <RegistrationStepper nations={nations} />
      </main>
      <GlobalFooter />
    </div>
  );
}
