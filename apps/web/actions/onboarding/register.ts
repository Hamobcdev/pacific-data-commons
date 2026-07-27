"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { registrationSchema, type RegistrationData } from "@/lib/onboarding/validation";

export interface RegisterResult {
  success: boolean;
  providerId?: string;
  error?: string;
  field?: string; // which field caused the error, for inline display
}

/**
 * Creates (or resumes) a provider record in Supabase. Called from Step 1 on
 * submit. An existing provider with the same contact_email is treated as a
 * resume, not a duplicate-registration error — R4: onboarding is resumable.
 */
export async function registerProvider(data: RegistrationData): Promise<RegisterResult> {
  const parsed = registrationSchema.safeParse(data);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Invalid input.", field: firstIssue?.path[0] as string | undefined };
  }

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("providers")
    .select("id")
    .eq("contact_email", parsed.data.contactEmail)
    .maybeSingle();

  if (existing) {
    return { success: true, providerId: existing.id as string };
  }

  let verifiedDomain: string;
  try {
    verifiedDomain = new URL(parsed.data.officialWebsite).hostname;
  } catch {
    return { success: false, error: "That website URL doesn't look valid.", field: "officialWebsite" };
  }

  const { data: provider, error } = await supabase
    .from("providers")
    .insert({
      institution_name: parsed.data.institutionName,
      institution_type: parsed.data.institutionType,
      country: parsed.data.country,
      contact_name: parsed.data.contactName,
      contact_email: parsed.data.contactEmail,
      verified_domain: verifiedDomain,
      onboarding_status: "registered",
      provider_track: "international",
      provider_pct: 97,
      sbp_fee_pct: 3,
      fee_threshold_usdc: 10.0,
      is_active: false,
    })
    .select("id")
    .single();

  if (error || !provider) {
    console.error("Provider registration failed:", error);
    return { success: false, error: "Registration failed. Please try again or contact SBP if this persists." };
  }

  return { success: true, providerId: provider.id as string };
}
