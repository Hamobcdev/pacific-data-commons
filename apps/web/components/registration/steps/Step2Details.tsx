"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { NationOption } from "@/app/[locale]/(public)/register/page";
import type { RegistrationFormState } from "../RegistrationStepper";
import { ListingTipsPanel } from "../ListingTipsPanel";
import {
  PROPERTY_TYPE_VALUES,
  TRANSPORT_TYPE_VALUES,
  FREQUENCY_VALUES,
  VENUE_TYPE_FOOD_BEVERAGE_VALUES,
  VENUE_TYPE_CONFERENCE_VALUES,
  AV_STANDARD_VALUES,
  type ProviderCategory,
} from "@/lib/tourism/providerFormSchema";
import {
  WATER_ACTIVITY_OPTIONS,
  TOUR_OPERATOR_OPTIONS,
  LOCAL_GUIDE_OPTIONS,
  CERTIFICATION_TYPE_OPTIONS,
  PRICE_PER_OPTIONS,
} from "@/lib/tourism/activityTypes";
import { MARKET_TYPE_OPTIONS, OPERATING_DAY_OPTIONS, BOOKING_METHOD_OPTIONS } from "@/lib/tourism/marketVendorTypes";

function toOptions(values: readonly string[]): SelectOption[] {
  return values.map((v) => ({ value: v, label: v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));
}

const PROPERTY_TYPE_OPTIONS = toOptions(PROPERTY_TYPE_VALUES);
const TRANSPORT_TYPE_OPTIONS = toOptions(TRANSPORT_TYPE_VALUES);
const FREQUENCY_OPTIONS = toOptions(FREQUENCY_VALUES);
const VENUE_TYPE_FOOD_BEVERAGE_OPTIONS = toOptions(VENUE_TYPE_FOOD_BEVERAGE_VALUES);
const VENUE_TYPE_CONFERENCE_OPTIONS = toOptions(VENUE_TYPE_CONFERENCE_VALUES);
const AV_STANDARD_OPTIONS = toOptions(AV_STANDARD_VALUES);
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export interface Step2DetailsProps {
  formState: RegistrationFormState;
  nations: NationOption[];
  updateFields: (patch: RegistrationFormState) => void;
  onNext: () => void;
  onBack: () => void;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): string {
  return typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
}
function bool(v: unknown): boolean {
  return v === true;
}
function arr(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

function toggleInArray(current: string[], value: string, checked: boolean): string[] {
  return checked ? [...current, value] : current.filter((v) => v !== value);
}

/**
 * Preview-only — mirrors generatePdcReferralTag() in registerProvider.ts
 * exactly. Duplicated rather than shared: that file is a "use server"
 * action and this task was scoped to four specific files, so a shared util
 * module wasn't an option. Keep both in sync if this logic ever changes.
 * The server action remains the source of truth for the value actually
 * stored — this is display only.
 */
function previewPdcReferralTag(businessName: string, nationCode: string): string {
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `pdc-${slug}-${nationCode.toLowerCase()}`;
}

function BaseFields({ formState, nations, updateFields }: { formState: RegistrationFormState; nations: NationOption[]; updateFields: (p: RegistrationFormState) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Business name" required>
        <Input value={str(formState.business_name)} onChange={(e) => updateFields({ business_name: e.target.value })} />
      </Field>
      <Field label="Contact email" required>
        <Input type="email" value={str(formState.contact_email)} onChange={(e) => updateFields({ contact_email: e.target.value })} />
      </Field>
      <Field label="Contact phone">
        <Input value={str(formState.contact_phone)} onChange={(e) => updateFields({ contact_phone: e.target.value })} />
      </Field>
      <Field label="Website URL">
        <Input value={str(formState.website_url)} onChange={(e) => updateFields({ website_url: e.target.value })} placeholder="https://" />
      </Field>
      <Field label="Booking link (optional)">
        <Input
          value={str(formState.booking_url)}
          onChange={(e) => updateFields({ booking_url: e.target.value })}
          placeholder="https://your-booking-page.com"
        />
        <p className="mt-1 text-xs text-gray-500">
          Direct link where customers or AI agents can book your services. Can be your own website, Airbnb,
          Booking.com, or any booking platform.
        </p>
      </Field>
      <Field label="Online payment link (optional)">
        <Input
          value={str(formState.payment_url)}
          onChange={(e) => updateFields({ payment_url: e.target.value })}
          placeholder="https://pay.your-business.com"
        />
        <p className="mt-1 text-xs text-gray-500">
          Link where customers can pay you directly online. PayPal link, Stripe checkout, bank payment portal, or
          e-commerce store.
        </p>
      </Field>
      <Field label="Primary booking platform (optional)">
        <Input
          value={str(formState.booking_platform)}
          onChange={(e) => updateFields({ booking_platform: e.target.value })}
          placeholder="e.g. Airbnb, Booking.com, direct website"
        />
        <p className="mt-1 text-xs text-gray-500">
          Name of your main booking or sales platform — helps AI agents route customers correctly.
        </p>
      </Field>
      <Field label="Facebook page (optional)">
        <Input
          value={str(formState.facebook_url)}
          onChange={(e) => updateFields({ facebook_url: e.target.value })}
          placeholder="https://facebook.com/yourbusiness"
        />
      </Field>
      <Field label="Instagram (optional)">
        <Input
          value={str(formState.instagram_url)}
          onChange={(e) => updateFields({ instagram_url: e.target.value })}
          placeholder="https://instagram.com/yourbusiness"
        />
      </Field>
      <Field label="WhatsApp number (optional)">
        <Input
          value={str(formState.whatsapp_number)}
          onChange={(e) => updateFields({ whatsapp_number: e.target.value })}
          placeholder="+685 XXXXXXX"
        />
        <p className="mt-1 text-xs text-gray-500">Many Pacific customers prefer WhatsApp for enquiries and bookings.</p>
      </Field>
      {str(formState.business_name).trim().length > 0 && str(formState.nation_code).length > 0 && (
        <Field label="Your PDC referral tag (auto-generated)">
          <p className="rounded-md bg-light-bg px-3 py-2 font-mono text-sm text-gray-700">
            {previewPdcReferralTag(str(formState.business_name), str(formState.nation_code))}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            This tag is automatically added to your booking link so you can track traffic and bookings that came
            from Pacific Data Commons. Useful for future referral commission arrangements.
          </p>
        </Field>
      )}
      <Field label="Nation" required>
        <Select
          value={str(formState.nation_code)}
          onChange={(e) => updateFields({ nation_code: e.target.value })}
          placeholder="Select a nation"
          options={nations.map((n) => ({ value: n.nation_code, label: n.nation_name }))}
        />
      </Field>
      <Field label="Town / area">
        <Input value={str(formState.town_or_area)} onChange={(e) => updateFields({ town_or_area: e.target.value })} />
      </Field>
      <Field label="Street address">
        <Input value={str(formState.street_address)} onChange={(e) => updateFields({ street_address: e.target.value })} />
      </Field>
      <Field label="Algorand wallet address (for future x402 endpoint payments — optional)">
        <Input
          value={str(formState.wallet_address)}
          onChange={(e) => updateFields({ wallet_address: e.target.value })}
          className="font-mono text-xs"
        />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={bool(formState.local_resident_rate_available)}
          onChange={(e) => updateFields({ local_resident_rate_available: e.target.checked })}
        />
        <span className="text-sm text-gray-700">Do you offer a local resident rate?</span>
      </div>
      {bool(formState.local_resident_rate_available) && (
        <Field label="Describe your local resident rate briefly">
          <Textarea
            value={str(formState.local_resident_rate_notes)}
            onChange={(e) => updateFields({ local_resident_rate_notes: e.target.value })}
          />
        </Field>
      )}
      {/* Decorative only — "coming soon", never interactive, nothing to persist. */}
      <div className="flex items-center gap-2 opacity-50">
        <Checkbox checked={false} disabled onChange={() => {}} />
        <span className="text-sm text-gray-500">Enable NFT-gated access (coming soon)</span>
      </div>
    </div>
  );
}

function AccommodationFields({ formState, updateFields }: { formState: RegistrationFormState; updateFields: (p: RegistrationFormState) => void }) {
  const rooms: Array<[string, string]> = [
    ["room_count_total", "Total rooms"],
    ["room_count_standard", "Standard rooms"],
    ["room_count_deluxe", "Deluxe rooms"],
    ["room_count_suite", "Suites"],
    ["room_count_overwater", "Overwater rooms"],
    ["room_count_fale_bure", "Fale / bure"],
    ["room_count_villa", "Villas"],
    ["room_count_accessible", "Accessible rooms"],
  ];
  const prices: Array<[string, string]> = [
    ["price_budget_min_usd", "Budget min (USD)"],
    ["price_budget_max_usd", "Budget max (USD)"],
    ["price_midrange_min_usd", "Mid-range min (USD)"],
    ["price_midrange_max_usd", "Mid-range max (USD)"],
    ["price_luxury_min_usd", "Luxury min (USD)"],
    ["price_luxury_max_usd", "Luxury max (USD)"],
  ];
  return (
    <div className="space-y-4">
      <Field label="Property name" required>
        <Input value={str(formState.property_name)} onChange={(e) => updateFields({ property_name: e.target.value })} />
      </Field>
      <Field label="Property type" required>
        <Select
          value={str(formState.property_type)}
          onChange={(e) => updateFields({ property_type: e.target.value })}
          placeholder="Select a property type"
          options={PROPERTY_TYPE_OPTIONS}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {rooms.map(([key, label]) => (
          <Field key={key} label={label}>
            <Input type="number" min={0} value={num(formState[key])} onChange={(e) => updateFields({ [key]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={bool(formState.has_restaurant)} onChange={(e) => updateFields({ has_restaurant: e.target.checked })} /> Restaurant
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={bool(formState.has_pool)} onChange={(e) => updateFields({ has_pool: e.target.checked })} /> Pool
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {prices.map(([key, label]) => (
          <Field key={key} label={label}>
            <Input type="number" min={0} value={num(formState[key])} onChange={(e) => updateFields({ [key]: e.target.value })} />
          </Field>
        ))}
      </div>
    </div>
  );
}

function ActivitiesFields({ formState, updateFields, category }: { formState: RegistrationFormState; updateFields: (p: RegistrationFormState) => void; category: ProviderCategory }) {
  const activityOptions = category === "water_activities" ? WATER_ACTIVITY_OPTIONS : category === "tour_operator" ? TOUR_OPERATOR_OPTIONS : LOCAL_GUIDE_OPTIONS;
  const certTypes = arr(formState.certification_type);
  return (
    <div className="space-y-4">
      <Field label="Location name" required>
        <Input value={str(formState.location_name)} onChange={(e) => updateFields({ location_name: e.target.value })} />
      </Field>
      <Field label="Activity name" required>
        <Input value={str(formState.activity_name)} onChange={(e) => updateFields({ activity_name: e.target.value })} />
      </Field>
      <Field label="Activity type" required>
        <Select
          value={str(formState.activity_type)}
          onChange={(e) => updateFields({ activity_type: e.target.value })}
          placeholder="Select an activity type"
          options={activityOptions}
        />
      </Field>
      {category === "water_activities" && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={bool(formState.certification_required)} onChange={(e) => updateFields({ certification_required: e.target.checked })} />
            Certification required
          </label>
          {bool(formState.certification_required) && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium text-gray-700">Certification types</legend>
              <div className="flex flex-wrap gap-3">
                {CERTIFICATION_TYPE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1 text-sm">
                    <Checkbox
                      checked={certTypes.includes(opt.value)}
                      onChange={(e) => updateFields({ certification_type: toggleInArray(certTypes, opt.value, e.target.checked) })}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Minimum group size">
          <Input type="number" min={1} value={num(formState.minimum_group_size)} onChange={(e) => updateFields({ minimum_group_size: e.target.value })} />
        </Field>
        <Field label="Maximum group size">
          <Input type="number" min={1} value={num(formState.maximum_group_size)} onChange={(e) => updateFields({ maximum_group_size: e.target.value })} />
        </Field>
        <Field label="Price min (USD)">
          <Input type="number" min={0} value={num(formState.price_min_usd)} onChange={(e) => updateFields({ price_min_usd: e.target.value })} />
        </Field>
        <Field label="Price max (USD)">
          <Input type="number" min={0} value={num(formState.price_max_usd)} onChange={(e) => updateFields({ price_max_usd: e.target.value })} />
        </Field>
      </div>
      <Field label="Price per">
        <Select
          value={str(formState.price_per)}
          onChange={(e) => updateFields({ price_per: e.target.value })}
          placeholder="Select a unit"
          options={PRICE_PER_OPTIONS}
        />
      </Field>
    </div>
  );
}

function TransportFields({ formState, updateFields }: { formState: RegistrationFormState; updateFields: (p: RegistrationFormState) => void }) {
  const bookingMethods = arr(formState.booking_method);
  return (
    <div className="space-y-4">
      <Field label="Transport type" required>
        <Select
          value={str(formState.transport_type)}
          onChange={(e) => updateFields({ transport_type: e.target.value })}
          placeholder="Select a transport type"
          options={TRANSPORT_TYPE_OPTIONS}
        />
      </Field>
      <Field label="Operator name" required>
        <Input value={str(formState.operator_name)} onChange={(e) => updateFields({ operator_name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Origin" required>
          <Input value={str(formState.origin)} onChange={(e) => updateFields({ origin: e.target.value })} />
        </Field>
        <Field label="Destination" required>
          <Input value={str(formState.destination)} onChange={(e) => updateFields({ destination: e.target.value })} />
        </Field>
      </div>
      <Field label="Frequency">
        <Select
          value={str(formState.frequency)}
          onChange={(e) => updateFields({ frequency: e.target.value })}
          placeholder="Select a frequency"
          options={FREQUENCY_OPTIONS}
        />
      </Field>
      <Field label="Schedule notes">
        <Input value={str(formState.schedule_notes)} onChange={(e) => updateFields({ schedule_notes: e.target.value })} placeholder="e.g. Daily 08:00 and 14:00" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Passenger capacity">
          <Input type="number" min={1} value={num(formState.passenger_capacity)} onChange={(e) => updateFields({ passenger_capacity: e.target.value })} />
        </Field>
        <Field label="Price min (USD)">
          <Input type="number" min={0} value={num(formState.price_min_usd)} onChange={(e) => updateFields({ price_min_usd: e.target.value })} />
        </Field>
        <Field label="Price max (USD)">
          <Input type="number" min={0} value={num(formState.price_max_usd)} onChange={(e) => updateFields({ price_max_usd: e.target.value })} />
        </Field>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-gray-700">Booking methods</legend>
        <div className="flex flex-wrap gap-3">
          {BOOKING_METHOD_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-1 text-sm">
              <Checkbox
                checked={bookingMethods.includes(opt.value)}
                onChange={(e) => updateFields({ booking_method: toggleInArray(bookingMethods, opt.value, e.target.checked) })}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function FoodBeverageFields({ formState, updateFields }: { formState: RegistrationFormState; updateFields: (p: RegistrationFormState) => void }) {
  const hours = (formState.operating_hours as Record<string, { open?: string; close?: string; closed?: boolean }>) ?? {};
  function updateDay(day: string, patch: Partial<{ open: string; close: string; closed: boolean }>) {
    updateFields({ operating_hours: { ...hours, [day]: { ...hours[day], ...patch } } });
  }
  return (
    <div className="space-y-4">
      <Field label="Venue name" required>
        <Input value={str(formState.venue_name)} onChange={(e) => updateFields({ venue_name: e.target.value })} />
      </Field>
      <Field label="Venue type" required>
        <Select
          value={str(formState.venue_type)}
          onChange={(e) => updateFields({ venue_type: e.target.value })}
          placeholder="Select a venue type"
          options={VENUE_TYPE_FOOD_BEVERAGE_OPTIONS}
        />
      </Field>
      <Field label="Cuisine type">
        <Input value={str(formState.cuisine_type)} onChange={(e) => updateFields({ cuisine_type: e.target.value })} placeholder="e.g. Samoan, seafood" />
      </Field>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={bool(formState.alcohol_licence)} onChange={(e) => updateFields({ alcohol_licence: e.target.checked })} /> Alcohol licence
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={bool(formState.reservations_required)} onChange={(e) => updateFields({ reservations_required: e.target.checked })} /> Reservations required
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price per person min (USD)">
          <Input type="number" min={0} value={num(formState.price_per_person_min_usd)} onChange={(e) => updateFields({ price_per_person_min_usd: e.target.value })} />
        </Field>
        <Field label="Price per person max (USD)">
          <Input type="number" min={0} value={num(formState.price_per_person_max_usd)} onChange={(e) => updateFields({ price_per_person_max_usd: e.target.value })} />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">Opening hours</legend>
        {DAY_KEYS.map((day) => (
          <div key={day} className="flex items-center gap-2 text-xs">
            <span className="w-20 capitalize text-gray-600">{day}</span>
            <Input type="time" className="w-28" disabled={bool(hours[day]?.closed)} value={hours[day]?.open ?? ""} onChange={(e) => updateDay(day, { open: e.target.value })} />
            <Input type="time" className="w-28" disabled={bool(hours[day]?.closed)} value={hours[day]?.close ?? ""} onChange={(e) => updateDay(day, { close: e.target.value })} />
            <label className="flex items-center gap-1">
              <Checkbox checked={bool(hours[day]?.closed)} onChange={(e) => updateDay(day, { closed: e.target.checked })} /> Closed
            </label>
          </div>
        ))}
      </fieldset>
    </div>
  );
}

function ConferenceEventsFields({ formState, updateFields }: { formState: RegistrationFormState; updateFields: (p: RegistrationFormState) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Venue name" required>
        <Input value={str(formState.venue_name)} onChange={(e) => updateFields({ venue_name: e.target.value })} />
      </Field>
      <Field label="Venue type" required>
        <Select
          value={str(formState.venue_type)}
          onChange={(e) => updateFields({ venue_type: e.target.value })}
          placeholder="Select a venue type"
          options={VENUE_TYPE_CONFERENCE_OPTIONS}
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Capacity (theatre)">
          <Input type="number" min={0} value={num(formState.capacity_theatre)} onChange={(e) => updateFields({ capacity_theatre: e.target.value })} />
        </Field>
        <Field label="Capacity (classroom)">
          <Input type="number" min={0} value={num(formState.capacity_classroom)} onChange={(e) => updateFields({ capacity_classroom: e.target.value })} />
        </Field>
        <Field label="Capacity (banquet)">
          <Input type="number" min={0} value={num(formState.capacity_banquet)} onChange={(e) => updateFields({ capacity_banquet: e.target.value })} />
        </Field>
      </div>
      <Field label="AV standard">
        <Select
          value={str(formState.av_standard)}
          onChange={(e) => updateFields({ av_standard: e.target.value })}
          placeholder="Select an AV standard"
          options={AV_STANDARD_OPTIONS}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={bool(formState.inhouse_catering)} onChange={(e) => updateFields({ inhouse_catering: e.target.checked })} /> In-house catering
      </label>
      <Field label="Accommodation nearby (optional description)">
        <Textarea value={str(formState.accommodation_nearby)} onChange={(e) => updateFields({ accommodation_nearby: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price half-day (USD)">
          <Input type="number" min={0} value={num(formState.price_half_day_usd)} onChange={(e) => updateFields({ price_half_day_usd: e.target.value })} />
        </Field>
        <Field label="Price full-day (USD)">
          <Input type="number" min={0} value={num(formState.price_full_day_usd)} onChange={(e) => updateFields({ price_full_day_usd: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

function MarketVendorFields({ formState, updateFields }: { formState: RegistrationFormState; updateFields: (p: RegistrationFormState) => void }) {
  const days = arr(formState.operating_days);
  return (
    <div className="space-y-4">
      <Field label="Market name" required>
        <Input value={str(formState.market_name)} onChange={(e) => updateFields({ market_name: e.target.value })} placeholder="e.g. Fugalei Market" />
      </Field>
      <Field label="Market type" required>
        <Select
          value={str(formState.market_type)}
          onChange={(e) => updateFields({ market_type: e.target.value })}
          placeholder="Select a market type"
          options={MARKET_TYPE_OPTIONS}
        />
      </Field>
      <Field label="Town">
        <Input value={str(formState.town)} onChange={(e) => updateFields({ town: e.target.value })} placeholder="e.g. Apia" />
      </Field>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-gray-700">Operating days</legend>
        <div className="flex flex-wrap gap-3">
          {OPERATING_DAY_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-1 text-sm">
              <Checkbox checked={days.includes(opt.value)} onChange={(e) => updateFields({ operating_days: toggleInArray(days, opt.value, e.target.checked) })} />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening time">
          <Input type="time" value={str(formState.opening_time)} onChange={(e) => updateFields({ opening_time: e.target.value })} />
        </Field>
        <Field label="Closing time">
          <Input type="time" value={str(formState.closing_time)} onChange={(e) => updateFields({ closing_time: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

const REQUIRED_KEYS_BY_CATEGORY: Record<ProviderCategory, string[]> = {
  accommodation: ["property_name", "property_type"],
  tour_operator: ["location_name", "activity_name", "activity_type"],
  water_activities: ["location_name", "activity_name", "activity_type"],
  local_guide: ["location_name", "activity_name", "activity_type"],
  transport: ["transport_type", "operator_name", "origin", "destination"],
  food_beverage: ["venue_name", "venue_type"],
  conference_events: ["venue_name", "venue_type"],
  market_vendor: ["market_name", "market_type"],
};

export function Step2Details({ formState, nations, updateFields, onNext, onBack }: Step2DetailsProps) {
  const category = formState.provider_category as ProviderCategory | undefined;

  const baseValid = str(formState.business_name).trim().length >= 2 && /\S+@\S+\.\S+/.test(str(formState.contact_email)) && str(formState.nation_code).length > 0;
  const categoryValid = category ? REQUIRED_KEYS_BY_CATEGORY[category].every((k) => str(formState[k]).length > 0) : false;
  const canProceed = baseValid && categoryValid;

  return (
    <div className="space-y-8">
      <BaseFields formState={formState} nations={nations} updateFields={updateFields} />
      {category === "accommodation" && <AccommodationFields formState={formState} updateFields={updateFields} />}
      {(category === "water_activities" || category === "tour_operator" || category === "local_guide") && (
        <ActivitiesFields formState={formState} updateFields={updateFields} category={category} />
      )}
      {category === "transport" && <TransportFields formState={formState} updateFields={updateFields} />}
      {category === "food_beverage" && <FoodBeverageFields formState={formState} updateFields={updateFields} />}
      {category === "conference_events" && <ConferenceEventsFields formState={formState} updateFields={updateFields} />}
      {category === "market_vendor" && <MarketVendorFields formState={formState} updateFields={updateFields} />}

      <ListingTipsPanel category={category} />

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onNext} disabled={!canProceed}>
          Next
        </Button>
      </div>
    </div>
  );
}
