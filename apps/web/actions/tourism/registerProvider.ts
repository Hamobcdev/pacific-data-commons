"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getStripeClient } from "@/lib/stripe";
import { sendProviderRegistrationNotification } from "@/lib/email/resend";
import { ProviderFormSchema, BaseProviderSchema, cleanEmptyStrings, type ProviderCategory, type ProviderFormData } from "@/lib/tourism/providerFormSchema";

// Same pinned model string as app/api/assistant/route.ts and apps/agents —
// one Claude model identifier across the repo.
const MODEL = "claude-sonnet-4-6";
const REGISTRATION_FEE_USD = 10;

export interface RegisterProviderInput {
  formData: unknown;
  paymentMethod: "usdc_algorand" | "stripe";
  /** Algorand tx id for usdc_algorand, Stripe Checkout Session id for stripe. */
  paymentReference: string;
  /** payment_intents.reference_id — only meaningful for usdc_algorand (Stripe
   * Checkout never creates a payment_intents row). May be empty for stripe. */
  referenceId: string;
}

export interface RegisterProviderResult {
  success: boolean;
  provider_id?: string;
  business_name?: string;
  error?: string;
}

const DETAIL_TABLE_BY_CATEGORY: Record<ProviderCategory, string> = {
  accommodation: "tourism_accommodations",
  tour_operator: "tourism_activities",
  water_activities: "tourism_activities",
  local_guide: "tourism_activities",
  transport: "tourism_transport",
  food_beverage: "tourism_food_beverage",
  conference_events: "tourism_conference_venues",
  market_vendor: "tourism_markets",
};

// Real tourism_providers columns an insert may populate (excludes
// id/created_at/updated_at, verified_at/verified_by/endpoint_id — SBP-admin
// only, never settable at registration — and the inert nft_*/loyalty/tiptide
// stub columns, not part of this flow).
const PROVIDER_COLUMN_ALLOWLIST = new Set([
  "business_name",
  "legal_entity_name",
  "provider_category",
  "nation_code",
  "island",
  "town_or_area",
  "street_address",
  "lat",
  "lng",
  "contact_email",
  "contact_phone",
  "website_url",
  "facebook_url",
  "instagram_url",
  "booking_url",
  "payment_url",
  "booking_platform",
  "pdc_referral_tag",
  "whatsapp_number",
  "languages_spoken",
  "years_operating",
  "locally_owned",
  "eco_certified",
  "eco_certification_name",
  "certifications_held",
  "insurance_held",
  "registration_fee_paid",
  "registration_fee_amount",
  "registration_fee_currency",
  "registration_fee_paid_at",
  "registration_payment_method",
  "verification_status",
  "source_type",
  "data_confidence",
]);

const DETAIL_COLUMN_ALLOWLIST: Record<string, Set<string>> = {
  tourism_accommodations: new Set([
    "property_name", "property_type", "star_rating_official", "star_rating_self_declared", "star_rating_certifying_body",
    "international_chain", "is_independent_boutique", "room_count_total", "room_count_standard", "room_count_deluxe",
    "room_count_suite", "room_count_overwater", "room_count_fale_bure", "room_count_villa", "room_count_accessible",
    "price_budget_min_usd", "price_budget_max_usd", "price_midrange_min_usd", "price_midrange_max_usd",
    "price_luxury_min_usd", "price_luxury_max_usd", "price_peak_multiplier", "peak_season_notes", "has_pool",
    "pool_count", "pool_types", "has_spa", "spa_services", "spa_local_treatments_available", "has_gym", "has_kids_club",
    "has_water_sports_hire", "has_currency_exchange", "has_laundry", "has_airport_transfer", "airport_transfer_type",
    "airport_transfer_cost_usd", "has_restaurant", "restaurant_open_to_nonguests", "restaurant_cuisine_types",
    "restaurant_dining_tier", "restaurant_traditional_dishes", "restaurant_dietary_options", "restaurant_signature_cocktails",
    "restaurant_local_spirits", "restaurant_kava_available", "restaurant_byo_permitted", "restaurant_alcohol_licence",
    "restaurant_rating_source", "restaurant_rating_score", "has_bar", "bar_types", "happy_hour_times", "has_casino",
    "casino_type", "casino_gaming_hours", "casino_dress_code", "casino_minimum_age", "has_conference_facilities",
    "conference_max_capacity_theatre", "conference_max_capacity_banquet", "conference_max_capacity_classroom",
    "conference_breakout_rooms", "conference_av_standard", "conference_catering_inhouse", "conference_outdoor_space",
    "conference_outdoor_capacity", "largest_event_hosted", "is_wedding_venue", "wedding_ceremony_types",
    "wedding_beach_permit_held", "wedding_traditional_elements", "wedding_honeymoon_packages", "wedding_vow_renewal_available",
    "wedding_planner_inhouse", "has_accessible_rooms", "accessible_room_count", "accessible_beach_entry",
    "accessible_pool_entry", "wheelchair_pathways", "accessibility_notes", "distance_to_town_km", "drive_time_to_town_min",
    "distance_to_airport_km", "drive_time_to_airport_min", "distance_to_market_km", "distance_to_hospital_km",
    "distance_to_pharmacy_km", "distance_to_atm_km", "distance_to_supermarket_km", "distance_to_ferry_terminal_km",
    "distance_to_domestic_airport_km", "year_round_road_access", "fourwd_required", "source_type", "data_confidence",
  ]),
  tourism_activities: new Set([
    "island", "location_name", "activity_type", "activity_name", "description", "lat", "lng", "skill_level",
    "certification_required", "certification_type", "minimum_age", "maximum_group_size", "minimum_group_size",
    "accessibility_rating", "accessible_options_available", "season_start", "season_end", "year_round", "best_time_notes",
    "water_temp_min_c", "water_temp_max_c", "visibility_min_m", "visibility_max_m", "depth_min_m", "depth_max_m",
    "current_rating", "marine_life_highlights", "natural_highlights", "coral_health_status", "reef_coordinate_lat",
    "reef_coordinate_lng", "price_min_usd", "price_max_usd", "price_per", "price_includes", "equipment_hire_available",
    "equipment_hire_cost_usd", "has_marine_hazards", "marine_hazard_types", "has_current_risk", "current_risk_notes",
    "has_shark_activity", "shark_risk_level", "survivor_connection", "survivor_notes", "other_production_connection",
    "source_type", "data_confidence",
  ]),
  tourism_transport: new Set([
    "transport_type", "operator_name", "origin", "destination", "origin_nation_code", "destination_nation_code",
    "frequency", "schedule_notes", "duration_minutes", "price_min_usd", "price_max_usd", "booking_method", "booking_url",
    "vessel_or_aircraft_type", "passenger_capacity", "luggage_allowance_kg", "accessibility_features",
    "safety_certification", "safety_certification_body", "reliability_notes", "source_type", "data_confidence",
  ]),
  tourism_food_beverage: new Set([
    "venue_name", "venue_type", "cuisine_types", "dining_tier", "traditional_dishes", "dietary_options",
    "signature_cocktails", "local_spirits_featured", "kava_available", "kava_type", "locally_sourced_ingredients",
    "seafood_speciality", "byo_permitted", "alcohol_licence", "rating_source", "rating_score",
    "price_per_person_min_usd", "price_per_person_max_usd", "seating_capacity", "reservations_required",
    "delivery_available", "catering_for_events", "catering_max_capacity", "operating_hours",
    "distance_to_tourist_area_km", "parking_available", "accessibility_notes", "source_type", "data_confidence",
  ]),
  tourism_conference_venues: new Set([
    "venue_name", "venue_type", "island", "lat", "lng", "capacity_theatre", "capacity_banquet", "capacity_classroom",
    "capacity_cocktail", "capacity_outdoor", "breakout_rooms", "av_standard", "natural_light", "inhouse_catering",
    "external_catering_permitted", "branding_options", "technical_support_onsite", "parking_capacity",
    "accommodation_nearby", "price_full_day_usd", "price_half_day_usd", "price_per_head_usd", "largest_event_hosted",
    "accessibility_notes", "source_type", "data_confidence",
  ]),
  tourism_markets: new Set([
    "market_name", "island", "town", "lat", "lng", "market_type", "operating_days", "opening_time", "closing_time",
    "payment_accepted", "is_covered", "distance_to_tourist_area_km", "signature_products", "guided_tours_available",
    "guided_tour_operator", "guided_tour_price_usd", "parking_available", "accessibility_notes",
    "best_visit_time_notes", "source_type", "data_confidence",
  ]),
};

const BASE_FIELD_KEYS = new Set(Object.keys(BaseProviderSchema.shape));

/**
 * Every category-specific form field in this flow was deliberately named to
 * match its real DB column exactly (Phase C schema audit) — so, unlike a
 * generic document-upload pipeline, there is nothing left for Claude to
 * legitimately "format" in detail_record beyond what the form already
 * collected verbatim. Relying on Claude to faithfully reproduce fields like
 * market_name/location_name/operator_name (all NOT NULL) risks a DB write
 * failure *after* payment has already been verified if it ever drops or
 * renames one. Pulling these directly from the validated form, and merging
 * them over (not under) Claude's output, removes that dependency entirely —
 * Claude's detail_record is kept only as a harmless fallback for any key the
 * form didn't collect.
 */
function extractFormDerivedDetailFields(formData: ProviderFormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(formData)) {
    if (key === "provider_category" || BASE_FIELD_KEYS.has(key)) continue;
    out[key] = value;
  }
  // cuisine_type (form: single free-text field) -> cuisine_types (the real
  // tourism_food_beverage column: TEXT[]). No comma-splitting — a one-element
  // array is the only safe interpretation of free text we weren't asked to parse.
  if ("cuisine_type" in out) {
    const cuisineType = out.cuisine_type;
    delete out.cuisine_type;
    out.cuisine_types = typeof cuisineType === "string" && cuisineType.length > 0 ? [cuisineType] : null;
  }
  return out;
}

function filterByAllowlist(record: Record<string, unknown>, allowlist: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (allowlist.has(key)) {
      out[key] = value;
    } else {
      console.warn("[registerProvider] dropping unrecognised column from LLM output", { key });
    }
  }
  return out;
}

/**
 * Change 4 (feature/provider-urls). Duplicated in Step2Details.tsx as
 * previewPdcReferralTag() for the client-side preview — this file is a
 * "use server" action and can't be imported into a client component, and
 * the task scoped this PR to four specific files, so a shared util module
 * wasn't an option. This function is the source of truth for the value
 * actually stored; the client copy is display-only. Keep both in sync if
 * this logic ever changes.
 */
function slugifyBusinessName(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generatePdcReferralTag(businessName: string, nationCode: string): string {
  return `pdc-${slugifyBusinessName(businessName)}-${nationCode.toLowerCase()}`;
}

function appendUtmParams(url: string, referralTag: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}utm_source=pdc&utm_medium=directory&utm_campaign=${encodeURIComponent(referralTag)}`;
}

const ClaudeOutputSchema = z.object({
  provider_record: z.record(z.unknown()),
  detail_record: z.record(z.unknown()),
  suggested_endpoint_label: z.string().max(60),
  suggested_tags: z.array(z.string()).min(3).max(5),
});

function buildClaudePrompt(formData: Record<string, unknown>): string {
  return `You are a data formatting assistant for the Pacific Data Commons directory.
Convert the following provider self-registration form submission into a structured
endpoint record. Return valid JSON only, no prose.

Input form data: ${JSON.stringify(formData)}

Output a JSON object with these top-level keys:
- provider_record: fields for the tourism_providers table
- detail_record: fields for the appropriate child table for this provider's category
- suggested_endpoint_label: a short public-facing label for this provider (max 60 chars)
- suggested_tags: array of 3-5 searchable tags

Rules:
- Set source_type to 'provider_self_listed'
- Set data_confidence to 'provider_self_declared'
- Set verification_status to 'pending'
- Do not invent any field values not present in the form submission
- Do not modify nation_code
- Include booking_url, payment_url, booking_platform, pdc_referral_tag, facebook_url, instagram_url, and whatsapp_number in provider_record if provided
- Never invent booking URLs, payment URLs, or social media handles not supplied by the provider
- The booking_url will already have UTM parameters appended — do not modify it`;
}

type ClaudeFormattingResult = { ok: true; data: z.infer<typeof ClaudeOutputSchema> } | { ok: false; error: string };

async function runClaudeFormatting(formData: Record<string, unknown>): Promise<ClaudeFormattingResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "formatting_unavailable" };
  }

  let rawText: string;
  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      temperature: 0,
      messages: [{ role: "user", content: buildClaudePrompt(formData) }],
    });
    rawText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  } catch (err) {
    console.error("[registerProvider] Claude API call failed", err instanceof Error ? err.message : err);
    return { ok: false, error: "formatting_unavailable" };
  }

  let parsedJson: unknown;
  try {
    // Claude is instructed to return JSON only, but strip code-fence wrapping
    // defensively in case it adds one anyway.
    const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    parsedJson = JSON.parse(stripped);
  } catch (err) {
    console.error("[registerProvider] Claude output was not valid JSON", { rawText, err });
    return { ok: false, error: "formatting_failed" };
  }

  const validated = ClaudeOutputSchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error("[registerProvider] Claude output failed schema validation", { rawText, issues: validated.error.issues });
    return { ok: false, error: "formatting_failed" };
  }

  return { ok: true, data: validated.data };
}

export async function registerProvider(input: RegisterProviderInput): Promise<RegisterProviderResult> {
  // 1. Rate limit — registration is rare and already gated by a $10 fee;
  // 5/hour/IP is generous enough not to block legitimate retries.
  const ip = await getClientIp();
  const rateLimit = checkRateLimit({ maxRequests: 5, windowMs: 60 * 60 * 1000, identifier: ip });
  if (!rateLimit.allowed) {
    return { success: false, error: "Too many registration attempts — please wait a while and try again." };
  }

  // 2. Re-validate the form data server-side — never trust client validation alone.
  const cleanedInput =
    input.formData && typeof input.formData === "object" ? cleanEmptyStrings(input.formData as Record<string, unknown>) : input.formData;
  const parsedForm = ProviderFormSchema.safeParse(cleanedInput);
  if (!parsedForm.success) {
    console.error("[registerProvider] form data failed validation", parsedForm.error.issues);
    return { success: false, error: "Some required fields are missing or invalid. Please review and try again." };
  }
  const formData = parsedForm.data;

  const supabase = createServiceClient();

  // 3. Payment verification — never record a "paid" registration without
  // confirming the payment actually happened.
  if (input.paymentMethod === "stripe") {
    try {
      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.retrieve(input.paymentReference);
      if (session.payment_status !== "paid" || session.metadata?.purpose !== "registration_fee") {
        console.error("[registerProvider] Stripe session did not verify as a paid registration fee", {
          sessionId: input.paymentReference,
          paymentStatus: session.payment_status,
          purpose: session.metadata?.purpose,
        });
        return { success: false, error: "Payment could not be verified." };
      }
    } catch (err) {
      console.error("[registerProvider] Stripe session retrieval failed", err instanceof Error ? err.message : err);
      return { success: false, error: "Payment could not be verified." };
    }
  } else {
    if (!input.referenceId) {
      return { success: false, error: "Missing payment reference." };
    }
    const { data: intent, error: intentError } = await supabase
      .from("payment_intents")
      .select("id, purpose, state, amount_usdc, provider_id")
      .eq("reference_id", input.referenceId)
      .maybeSingle();
    if (intentError || !intent) {
      console.error("[registerProvider] payment_intents lookup failed", intentError?.message);
      return { success: false, error: "Payment could not be verified." };
    }
    const unverifiedStates = new Set(["pending", "tx_submitted"]);
    if (
      intent.purpose !== "registration_fee" ||
      unverifiedStates.has(intent.state) ||
      Number(intent.amount_usdc) !== REGISTRATION_FEE_USD ||
      intent.provider_id !== null
    ) {
      console.error("[registerProvider] payment_intents row failed verification checks", intent);
      return { success: false, error: "Payment could not be verified." };
    }
  }

  // 4. Generate the referral tag and UTM-tagged booking link before the
  // Claude call — the prompt tells Claude these are already final and not
  // to invent or modify them, so it needs to see the final values to echo
  // them back into provider_record. No booking_url_original column exists
  // on tourism_providers (migration 20261028000001 didn't add one), so only
  // the UTM-appended version is stored.
  const pdcReferralTag = generatePdcReferralTag(formData.business_name, formData.nation_code);
  const bookingUrlWithUtm = formData.booking_url ? appendUtmParams(formData.booking_url, pdcReferralTag) : undefined;
  const formDataForClaude: Record<string, unknown> = {
    ...formData,
    pdc_referral_tag: pdcReferralTag,
    ...(bookingUrlWithUtm !== undefined ? { booking_url: bookingUrlWithUtm } : {}),
  };

  // 5. Claude API formatting (P9 — output validated against a strict schema
  // before any of it is used; see runClaudeFormatting).
  const formatted = await runClaudeFormatting(formDataForClaude);
  if (!formatted.ok) {
    return { success: false, error: formatted.error };
  }

  const detailTable = DETAIL_TABLE_BY_CATEGORY[formData.provider_category];

  // Defense in depth: never let an LLM-invented column name reach a
  // Supabase insert, even though the output already passed schema
  // validation above.
  const filteredProviderRecord = filterByAllowlist(formatted.data.provider_record, PROVIDER_COLUMN_ALLOWLIST);
  const filteredDetailRecord = filterByAllowlist(formatted.data.detail_record, DETAIL_COLUMN_ALLOWLIST[detailTable] ?? new Set<string>());

  const nowIso = new Date().toISOString();

  // Fields taken directly from the validated form submission, not from
  // Claude's output — these are either structural (must never drift from
  // what the user actually submitted/paid) or have no business being
  // LLM-generated in the first place.
  const providerRecord = {
    ...filteredProviderRecord,
    business_name: formData.business_name,
    contact_email: formData.contact_email,
    contact_phone: formData.contact_phone ?? null,
    website_url: formData.website_url ?? null,
    facebook_url: formData.facebook_url ?? null,
    instagram_url: formData.instagram_url ?? null,
    booking_url: bookingUrlWithUtm ?? null,
    payment_url: formData.payment_url ?? null,
    booking_platform: formData.booking_platform ?? null,
    pdc_referral_tag: pdcReferralTag,
    whatsapp_number: formData.whatsapp_number ?? null,
    provider_category: formData.provider_category,
    nation_code: formData.nation_code,
    town_or_area: formData.town_or_area ?? null,
    street_address: formData.street_address ?? null,
    wallet_address: formData.wallet_address ?? null,
    local_resident_rate_available: formData.local_resident_rate_available,
    local_resident_rate_notes: formData.local_resident_rate_notes ?? null,
    registration_fee_paid: true,
    registration_fee_amount: REGISTRATION_FEE_USD,
    registration_fee_currency: "USD",
    registration_fee_paid_at: nowIso,
    registration_payment_method: input.paymentMethod,
    verification_status: "pending",
    source_type: "provider_self_listed",
    data_confidence: "provider_self_declared",
  };

  // 6. Supabase write.
  const { data: insertedProvider, error: providerInsertError } = await supabase
    .from("tourism_providers")
    .insert(providerRecord)
    .select("id")
    .single();

  if (providerInsertError || !insertedProvider) {
    console.error("[registerProvider] tourism_providers insert failed", providerInsertError?.message);
    return { success: false, error: "database_write_failed" };
  }

  const providerId = insertedProvider.id as string;

  const detailRecord = {
    ...filteredDetailRecord,
    ...extractFormDerivedDetailFields(formData),
    tourism_provider_id: providerId,
    nation_code: formData.nation_code,
  };

  const { error: detailInsertError } = await supabase.from(detailTable).insert(detailRecord);
  if (detailInsertError) {
    // No multi-table transaction available here — a provider row created
    // with no matching detail row is a rare, loudly-logged edge case for
    // this POC, not silently swallowed.
    console.error("[registerProvider] detail record insert failed after provider created", {
      providerId,
      detailTable,
      error: detailInsertError.message,
    });
    return { success: false, error: "database_write_failed" };
  }

  if (input.paymentMethod === "usdc_algorand" && input.referenceId) {
    const { error: updateError } = await supabase
      .from("payment_intents")
      .update({ provider_id: providerId })
      .eq("reference_id", input.referenceId);
    if (updateError) {
      console.error("[registerProvider] payment_intents.provider_id update failed (non-fatal)", updateError.message);
    }
  }

  // 7. Resend notification — never let a send failure affect the result
  // already committed above.
  await sendProviderRegistrationNotification({
    businessName: formData.business_name,
    providerCategory: formData.provider_category,
    nationCode: formData.nation_code,
    contactEmail: formData.contact_email,
    submittedAt: nowIso,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
    suggestedEndpointLabel: formatted.data.suggested_endpoint_label,
    suggestedTags: formatted.data.suggested_tags,
  });

  return { success: true, provider_id: providerId, business_name: formData.business_name };
}
