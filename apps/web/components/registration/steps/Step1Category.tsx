import { Card, CardContent, CardTitle } from "@/components/ui/card";
import type { ProviderCategory } from "@/lib/tourism/providerFormSchema";
import type { RegistrationFormState } from "../RegistrationStepper";

interface CategoryDef {
  value: ProviderCategory;
  label: string;
  description: string;
}

const CATEGORIES: CategoryDef[] = [
  { value: "accommodation", label: "Accommodation", description: "Hotel, resort, guesthouse, beach fale, homestay, overwater bungalow, villa" },
  { value: "tour_operator", label: "Tour Operator", description: "Day tours, cultural, adventure, multi-day, out-to-island" },
  { value: "water_activities", label: "Water Activities", description: "Dive school, snorkel guide, surf school, whale watching, fishing charter" },
  { value: "transport", label: "Transport", description: "Ferry, domestic airline, inter-island transfer, airport transfer, car hire" },
  { value: "food_beverage", label: "Food & Beverage", description: "Restaurant, bar, café, kava bar, catering" },
  { value: "conference_events", label: "Conference & Events Venue", description: "Conference centres, event spaces, and function venues" },
  { value: "local_guide", label: "Local Guide & Interpreter", description: "Cultural guides, nature guides, and language interpreters" },
  { value: "market_vendor", label: "Market Vendor", description: "Food stall, clothing, souvenirs, carvings, crafts" },
];

/** Not yet selectable — no provider_category/detail-table support exists
 * for these yet (registerProvider.ts's DETAIL_TABLE_BY_CATEGORY only covers
 * the 8 tourism categories above). Display-only "coming soon" stubs. */
interface StubCategoryDef {
  label: string;
  description: string;
}

const STUB_CATEGORIES: StubCategoryDef[] = [
  { label: "Retail & E-commerce", description: "List your retail store or online shop" },
  { label: "Professional Services", description: "Lawyers, accountants, consultants" },
  { label: "Health & Wellness", description: "Clinics, practitioners, pharmacies" },
  { label: "Education & Training", description: "Tutors, training providers, institutions" },
  { label: "Agriculture & Fishing", description: "Producers, exporters, fishing operators" },
  { label: "Construction & Trade", description: "Contractors, suppliers, engineers" },
];

export interface Step1CategoryProps {
  formState: RegistrationFormState;
  onSelect: (category: ProviderCategory) => void;
}

export function Step1Category({ formState, onSelect }: Step1CategoryProps) {
  const selected = formState.provider_category as ProviderCategory | undefined;

  return (
    <div>
      <h2 className="text-lg font-semibold text-navy mb-4">What kind of business are you registering?</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CATEGORIES.map((cat) => (
          <button key={cat.value} type="button" onClick={() => onSelect(cat.value)} className="text-left">
            <Card className={selected === cat.value ? "border-ocean ring-2 ring-ocean" : "hover:border-ocean/50 transition-colors"}>
              <CardTitle>{cat.label}</CardTitle>
              <CardContent>{cat.description}</CardContent>
            </Card>
          </button>
        ))}
      </div>

      <h3 className="text-sm font-semibold text-gray-500 mt-8 mb-4">More industries coming soon</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {STUB_CATEGORIES.map((stub) => (
          <Card key={stub.label} aria-disabled="true" className="cursor-not-allowed opacity-50">
            <CardTitle>{stub.label}</CardTitle>
            <CardContent>{stub.description}</CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-sm text-gray-600">
        Want your industry listed? Pacific Data Commons is expanding the directory to cover every sector of the Pacific
        economy. If your business type isn&apos;t listed yet, contact us at{" "}
        <a href="mailto:anthony@synergybcpacific.com" className="text-ocean underline">
          anthony@synergybcpacific.com
        </a>{" "}
        to be notified when your category opens, or to discuss early listing options.
      </p>
    </div>
  );
}
