"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { registrationSchema, type RegistrationData } from "@/lib/onboarding/validation";
import { getServerMessage } from "@/lib/i18n/server-messages";
import { createOnboardingSession } from "@/lib/onboarding/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { shouldBypassVerification, DEMO_CREDENTIALS } from "@/lib/demo-mode";

export interface RegisterResult {
  success: boolean;
  providerId?: string;
  sessionToken?: string;
  error?: string;
  field?: string; // which field caused the error, for inline display
  /** True when the error is "an account already exists" — the UI should
   * point the provider at the resume-by-email flow (ResumeOtp, Session 10)
   * rather than showing a generic error. */
  alreadyRegistered?: boolean;
}

function extractDomain(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

function extractEmailDomain(email: string): string {
  return email.split("@")[1] ?? "";
}

/**
 * Common personal email providers exempted from the institutional-domain
 * match during the pilot period — institutional email setup is a real
 * access barrier for some pilot registrants (e.g. a researcher whose
 * institution hasn't issued them an address yet, or a small NGO that runs
 * entirely on Gmail). Every Bronze registration already goes through SBP's
 * clerical verification_queue (complete-onboarding.ts) regardless of this
 * exemption, so "reviewed manually" in the UI copy is accurate — it's not
 * a new promise this bypass introduces.
 *
 * Remove this exemption when institutional email is enforced at launch
 * (CLAUDE.md Section 8, Bronze tier identity verification).
 */
const PILOT_ALLOWED_EMAIL_DOMAINS = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com"];

/** H3: contact email domain must match (or be a subdomain of) the verified
 * institutional website domain — j.smith@marine.usp.ac.fj matches usp.ac.fj.
 * Pilot exemption: common personal email providers bypass this check — see
 * PILOT_ALLOWED_EMAIL_DOMAINS above. */
function emailMatchesDomain(email: string, websiteDomain: string): boolean {
  const emailDomain = extractEmailDomain(email).toLowerCase();
  if (PILOT_ALLOWED_EMAIL_DOMAINS.includes(emailDomain)) return true;
  const site = websiteDomain.toLowerCase();
  return emailDomain === site || emailDomain.endsWith(`.${site}`);
}

/**
 * Creates a provider record in Supabase and starts a new onboarding
 * session. Called from Step 1 on submit.
 *
 * C1 fix: an existing provider with the same contact_email is NOT treated
 * as an implicit resume anymore — that was the hijack vector (anyone who
 * knew or guessed an institution's contact email got a live, fully
 * privileged providerId with zero further verification). A genuine returning
 * provider is directed to the magic-link resume flow (lib/onboarding/resume.ts
 * — the correct, email-ownership-verified pattern) instead of being handed a
 * session directly from this unauthenticated form submission.
 */
export async function registerProvider(data: RegistrationData): Promise<RegisterResult> {
  const ip = await getClientIp();
  const rateLimit = checkRateLimit({ identifier: `register:${ip}`, maxRequests: 5, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return { success: false, error: "Too many registration attempts. Please try again in an hour." };
  }

  const parsed = registrationSchema.safeParse(data);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Invalid input.", field: firstIssue?.path[0] as string | undefined };
  }

  const demoBypass = shouldBypassVerification();

  let verifiedDomain: string;
  try {
    verifiedDomain = demoBypass ? DEMO_CREDENTIALS.domain : extractDomain(parsed.data.officialWebsite);
  } catch {
    return { success: false, error: getServerMessage("actions.register.invalidWebsite"), field: "officialWebsite" };
  }

  // H3 — email domain must match the institution's verified website domain.
  if (!demoBypass && !emailMatchesDomain(parsed.data.contactEmail, verifiedDomain)) {
    return {
      success: false,
      error: `Your email domain (@${extractEmailDomain(parsed.data.contactEmail)}) doesn't match your institution website (${verifiedDomain}). Please use your institutional email address.`,
      field: "contactEmail",
    };
  }

  const supabase = createServiceClient();

  const { data: existing } = await supabase.from("providers").select("id").eq("contact_email", parsed.data.contactEmail).maybeSingle();

  if (existing) {
    return {
      success: false,
      error: "An account is already registered with this email address. Use the link below to send yourself a secure sign-in link and continue where you left off.",
      field: "contactEmail",
      alreadyRegistered: true,
    };
  }

  // Multi-faculty institution model (Session 9): auto-link by verified
  // domain, no approval step. The first provider to register for a given
  // domain seeds the institutions row; every later provider on that same
  // domain links to it automatically and is displayed as a distinct
  // faculty/department under the shared institution in the directory.
  let institutionId: string | null = null;
  const { data: existingInstitution } = await supabase.from("institutions").select("id").eq("verified_domain", verifiedDomain).maybeSingle();

  if (existingInstitution) {
    institutionId = existingInstitution.id as string;
  } else {
    const { data: institution, error: institutionError } = await supabase
      .from("institutions")
      .insert({
        institution_name: parsed.data.institutionName,
        verified_domain: verifiedDomain,
        institution_type: parsed.data.institutionType,
        country: parsed.data.country,
        official_website: parsed.data.officialWebsite,
        verification_status: demoBypass ? "verified" : "pending",
      })
      .select("id")
      .single();

    if (institutionError || !institution) {
      console.error("Institution create failed:", institutionError);
      return { success: false, error: getServerMessage("actions.register.genericError") };
    }
    institutionId = institution.id as string;
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
      institution_id: institutionId,
      faculty_name: parsed.data.institutionName,
      faculty_contact_email: parsed.data.contactEmail,
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
    return { success: false, error: getServerMessage("actions.register.genericError") };
  }

  const providerId = provider.id as string;
  const sessionToken = await createOnboardingSession(providerId);

  return { success: true, providerId, sessionToken };
}
