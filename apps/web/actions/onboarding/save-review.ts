"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { reviewSchema, type ReviewData } from "@/lib/onboarding/validation";
import { BRONZE_CAPPED_TIERS, BRONZE_PRICE_CAP_USDC } from "@/lib/onboarding/tiers";
import { getServerMessage } from "@/lib/i18n/server-messages";
import { validateOnboardingSession, InvalidOnboardingSessionError, SESSION_EXPIRED_ERROR } from "@/lib/onboarding/session";
import type { PricingTier } from "@pdc/shared-types";

export interface SaveReviewResult {
  success: boolean;
  error?: string;
  field?: string;
  nextStep?: "/onboarding/provenance";
}

export interface OriginalUploadSummary {
  filename: string;
  fileType: string;
  fieldCount: number | null;
  uploadedAt: string;
}

export interface ReviewContext {
  uploads: OriginalUploadSummary[];
  /** Decision 23 — bypasses the Bronze Tier 1-2 price cap in the UI warning
   * (save-review.ts still enforces the cap server-side regardless). */
  verifiedGovernment: boolean;
  /** AI-suggested starting values for the structured output panel — sourced
   * from Step 3's upload-context capture (formatting_runs.stage_classification).
   * No live AI classification pipeline exists in this repo yet (see Session 6
   * report); this is the same graceful degradation pattern used elsewhere
   * (domain/wallet checks) rather than a placeholder. */
  suggested: {
    title: string;
    description: string;
    category: string;
    subCategory: string;
    geography: string;
    timePeriodStart: string;
    timePeriodEnd: string;
  } | null;
}

/** Loads Step 4's left-panel (original upload) and right-panel (AI
 * suggestion baseline) data for a given provider. Read-only — never blocks
 * or throws; an empty/null result just means the panels render their
 * "not yet available" state. */
export async function getReviewContext(providerId: string, sessionToken: string): Promise<ReviewContext> {
  try {
    await validateOnboardingSession(providerId, sessionToken);
  } catch {
    return { uploads: [], suggested: null, verifiedGovernment: false };
  }

  const supabase = createServiceClient();

  const { data: provider } = await supabase.from("providers").select("verified_government").eq("id", providerId).maybeSingle();

  const { data: run } = await supabase
    .from("formatting_runs")
    .select("file_ids, stage_classification")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fileIds = (run?.file_ids ?? []) as string[];
  let uploads: OriginalUploadSummary[] = [];
  if (fileIds.length > 0) {
    const { data: files } = await supabase
      .from("uploaded_files")
      .select("original_filename, file_type, parse_output, uploaded_at")
      .in("id", fileIds);
    uploads = (files ?? []).map((f) => ({
      filename: f.original_filename as string,
      fileType: f.file_type as string,
      fieldCount: f.parse_output && typeof f.parse_output === "object" ? Object.keys(f.parse_output as object).length : null,
      uploadedAt: f.uploaded_at as string,
    }));
  }

  const classification = run?.stage_classification as
    | {
        data_title?: string;
        data_description?: string;
        data_category?: string;
        data_sub_category?: string;
        geography_region?: string;
        time_period_start?: number;
        time_period_end?: number;
      }
    | null
    | undefined;

  const suggested = classification
    ? {
        title: classification.data_title ?? "",
        description: classification.data_description ?? "",
        category: classification.data_category ?? "",
        subCategory: classification.data_sub_category ?? "",
        geography: classification.geography_region ?? "",
        timePeriodStart: classification.time_period_start ? String(classification.time_period_start) : "",
        timePeriodEnd: classification.time_period_end ? String(classification.time_period_end) : "",
      }
    : null;

  return { uploads, suggested, verifiedGovernment: provider?.verified_government === true };
}

interface StageClassification {
  data_title?: string;
  data_description?: string;
  data_category?: string;
  data_sub_category?: string;
  geography_region?: string;
  time_period_start?: number;
  time_period_end?: number;
  indigenous_data_flag?: boolean;
  cultural_sensitivity?: string;
}

/**
 * Diffs the submitted review against the formatting_run's original
 * stage_classification baseline — formatting_runs.provider_edits (Session 1
 * schema comment: "What the provider changed during review") records only
 * what actually changed, not the full form state.
 */
function diffProviderEdits(baseline: StageClassification, data: ReviewData): Record<string, unknown> {
  const edits: Record<string, unknown> = {};
  if (baseline.data_title !== data.title) edits.title = data.title;
  if (baseline.data_description !== data.description) edits.description = data.description;
  if (baseline.data_category !== data.category) edits.category = data.category;
  if ((baseline.data_sub_category ?? "") !== data.subCategory) edits.subCategory = data.subCategory;
  if (baseline.geography_region !== data.geography) edits.geography = data.geography;
  if (String(baseline.time_period_start ?? "") !== data.timePeriodStart) edits.timePeriodStart = data.timePeriodStart;
  if (String(baseline.time_period_end ?? "") !== data.timePeriodEnd) edits.timePeriodEnd = data.timePeriodEnd;

  const pricingEdits = data.pricing
    .filter((row) => Number(row.overridePriceUsdc) !== row.aiSuggestedPriceUsdc)
    .map((row) => ({ tier: row.tier, aiSuggestedPriceUsdc: row.aiSuggestedPriceUsdc, overridePriceUsdc: row.overridePriceUsdc }));
  if (pricingEdits.length > 0) edits.pricing = pricingEdits;

  return edits;
}

/**
 * Step 4 submit. Validates the full review form (including all five
 * individually-checked sensitivity confirmations — CLAUDE.md P9), marks the
 * formatting_run approved, and upserts the `endpoints` row Step 6 (deploy)
 * and Step 7 (complete) both depend on. There is no formatting_runs ->
 * endpoints foreign key in the Session 1 schema, so later steps resolve the
 * endpoint by (provider_id, most recently created) — a single-dataset POC
 * onboarding flow only ever has one in-progress endpoint per provider.
 */
export async function saveReview(providerId: string, sessionToken: string, data: ReviewData): Promise<SaveReviewResult> {
  try {
    await validateOnboardingSession(providerId, sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? SESSION_EXPIRED_ERROR : "Invalid session." };
  }

  const parsed = reviewSchema.safeParse(data);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Please complete all required fields.", field: firstIssue?.path.join(".") };
  }

  const supabase = createServiceClient();

  const { data: run, error: runError } = await supabase
    .from("formatting_runs")
    .select("id, stage_classification")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError || !run) {
    console.error("Review save failed — no formatting_run found:", runError);
    return { success: false, error: getServerMessage("actions.saveReview.noUploadFound") };
  }

  const baseline = (run.stage_classification ?? {}) as StageClassification;
  const providerEdits = diffProviderEdits(baseline, parsed.data);

  const { data: provider } = await supabase.from("providers").select("verified_government").eq("id", providerId).maybeSingle();
  const bypassBronzeCap = provider?.verified_government === true;

  for (const row of parsed.data.pricing) {
    const price = Number(row.overridePriceUsdc);
    if (!bypassBronzeCap && (BRONZE_CAPPED_TIERS as readonly number[]).includes(row.tier) && price > BRONZE_PRICE_CAP_USDC) {
      return {
        success: false,
        error: `Tier ${row.tier} price cannot exceed $${BRONZE_PRICE_CAP_USDC.toFixed(2)} at Bronze tier unless your institution is a verified government provider.`,
        field: "pricing",
      };
    }
  }

  const { error: runUpdateError } = await supabase
    .from("formatting_runs")
    .update({
      provider_approved: true,
      provider_edits: providerEdits,
      approved_at: new Date().toISOString(),
      status: "approved",
    })
    .eq("id", run.id);

  if (runUpdateError) {
    console.error("Review save — formatting_run update failed:", runUpdateError);
    return { success: false, error: getServerMessage("actions.saveReview.genericError") };
  }

  const pricingTiers: PricingTier[] = parsed.data.pricing.map((row) => ({
    tier: row.tier,
    name: row.name,
    description: row.description,
    price_usdc: Number(row.overridePriceUsdc),
    path: `/${row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  }));

  const { data: existingEndpoint } = await supabase
    .from("endpoints")
    .select("id")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const endpointRow = {
    provider_id: providerId,
    data_category: parsed.data.category,
    data_sub_category: parsed.data.subCategory || null,
    title: parsed.data.title,
    description: parsed.data.description,
    geography_region: parsed.data.geography,
    time_period_start: Number(parsed.data.timePeriodStart),
    time_period_end: Number(parsed.data.timePeriodEnd),
    pricing_tiers: pricingTiers,
    indigenous_data_flag: baseline.indigenous_data_flag ?? false,
    cultural_sensitivity: baseline.cultural_sensitivity ?? "none",
  };

  const { error: endpointError } = existingEndpoint
    ? await supabase.from("endpoints").update(endpointRow).eq("id", existingEndpoint.id)
    : await supabase.from("endpoints").insert(endpointRow);

  if (endpointError) {
    console.error("Review save — endpoints upsert failed:", endpointError);
    return { success: false, error: getServerMessage("actions.saveReview.endpointSaveError") };
  }

  return { success: true, nextStep: "/onboarding/provenance" };
}
