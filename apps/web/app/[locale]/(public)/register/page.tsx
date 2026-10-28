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
      <div
        className="relative w-full h-[200px] md:h-[280px] bg-cover bg-center"
        style={{ backgroundImage: "url('/proposals/img-hero.jpg')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/35 to-black/70" />
      </div>
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-navy mb-2">List Your Tourism Business</h1>
        <p className="text-sm text-gray-600 mb-8">
          Register your Pacific business in the PDC service directory — the structured data layer that AI agents, travel
          platforms, and digital marketplaces query when searching for Pacific products and services. Tourism providers:
          register now. More industries opening soon.
        </p>
        <p className="text-center text-gray-500 text-[0.9rem] mb-4">
          Not sure if PDC is right for you?{" "}
          <a href="/proposals/provider-explainer-2026.html" className="underline hover:text-navy">
            Read how it works →
          </a>
        </p>
        <RegistrationStepper nations={nations} />
      </main>
      <GlobalFooter />
    </div>
  );
}
