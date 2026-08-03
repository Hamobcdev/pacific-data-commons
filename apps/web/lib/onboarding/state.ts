import type { CulturalSensitivity, DataCategory, InstitutionType, UpdateFrequency, UploadedFileType } from "@pdc/shared-types";

export type OnboardingStep = "register" | "wallet" | "upload" | "review" | "provenance" | "deploy" | "complete";

export interface UploadedFileState {
  /** Local UUID for tracking before the row exists in Supabase. */
  id: string;
  filename: string;
  fileType: UploadedFileType;
  fileSizeBytes: number;
  uploadStatus: "queued" | "uploading" | "paused" | "complete" | "failed";
  uploadProgress: number; // 0-100
  r2Key: string | null; // set when upload completes
  supabaseFileId: string | null; // set when the uploaded_files row is created
}

/** One row of Step 4's per-tier pricing editor. `aiSuggestedPriceUsdc` is
 * read-only display; `overridePriceUsdc` is the provider's editable value
 * (string so an empty/in-progress input is representable — parsed to a
 * number only at validation/submit time). */
export interface ReviewPricingRow {
  tier: 1 | 2 | 3 | 4 | 5;
  name: string;
  description: string;
  aiSuggestedPriceUsdc: number;
  overridePriceUsdc: string;
}

/** Step 4's five sensitivity/sovereignty confirmations — each starts
 * unchecked (R7 / CLAUDE.md P9) and must be individually ticked; there is
 * no bulk-accept for this section (see components/review/ReviewLayout.tsx). */
export interface ReviewSensitivityState {
  noPersonalData: boolean;
  noTraditionalKnowledge: boolean;
  noCulturallySensitive: boolean;
  rightsHeld: boolean;
  exportControlReviewed: boolean;
}

export interface ReviewState {
  title: string;
  description: string;
  category: DataCategory | "";
  subCategory: string;
  geography: string;
  timePeriodStart: string;
  timePeriodEnd: string;
  pricing: ReviewPricingRow[];
  sensitivity: ReviewSensitivityState;
}

export type LiveVerificationStatus = "unchecked" | "checking" | "verified" | "manual";

export interface ProvenanceResearcher {
  /** Local id for list keys / add-remove — not a DB id. */
  id: string;
  name: string;
  orcid: string;
  orcidStatus: LiveVerificationStatus;
  /** Name returned by the ORCID public API on a successful lookup. */
  orcidVerifiedName: string | null;
}

export type PeerReviewStatus = "none" | "under-review" | "published";

export interface ProvenanceState {
  methodology: string;
  researchers: ProvenanceResearcher[];
  doi: string;
  doiStatus: LiveVerificationStatus;
  /** Title returned by the CrossRef API on a successful lookup. */
  doiVerifiedTitle: string | null;
  peerReviewStatus: PeerReviewStatus | "";
  peerReviewVenue: string;
  fundingSource: string;
  knownLimitations: string;
}

export type DeployPath = "sbp_managed" | "self_hosted";

export interface DeployState {
  path: DeployPath | "";
  /** Set once Step 6's SBP-managed path has created an endpoint_deployments row. */
  deploymentId: string | null;
}

/** The complete onboarding state across all 7 steps. Persists to
 * localStorage on every change (R3) and to Supabase per-step via server
 * actions (R4) — see saveLocalState() below and actions/onboarding/*.ts. */
export interface OnboardingState {
  providerId: string | null; // set after Step 1 creates the DB record
  /** Onboarding ownership token minted by register.ts (see
   * lib/onboarding/session.ts). Every mutating onboarding/upload action
   * requires providerId + sessionToken together — a bare providerId is no
   * longer sufficient proof of ownership (Session 9 C1 fix). */
  sessionToken: string | null;
  currentStep: OnboardingStep;
  lastSavedAt: string | null;

  registration: {
    institutionName: string;
    institutionType: InstitutionType | "";
    country: string;
    contactName: string;
    contactEmail: string;
    officialWebsite: string;
    domainVerified: boolean | null; // null = not checked yet
  };

  wallet: {
    walletAddress: string;
    walletVerified: boolean | null; // null = not checked
    usdcOptedIn: boolean | null; // null = not checked
    hasInstitutionalAuthority: boolean | null;
  };

  upload: {
    uploadedFiles: UploadedFileState[];
    dataTitle: string;
    dataDescription: string;
    dataCategory: DataCategory | "";
    dataSubCategory: string;
    geographyRegion: string;
    timePeriodStart: string;
    timePeriodEnd: string;
    updateFrequency: UpdateFrequency | "";
    methodologySummary: string;
    // Sovereignty fields — require explicit confirmation (R7)
    indigenousDataFlag: boolean | null; // null = not confirmed
    culturalSensitivity: CulturalSensitivity | null; // null = not confirmed
    sensitivityConfirmed: boolean; // provider must check a box
  };

  review: ReviewState;
  provenance: ProvenanceState;
  deploy: DeployState;
}

const STORAGE_KEY = "pdc-onboarding-state";

/** Loads onboarding state from localStorage. Returns null on first visit. */
export function loadLocalState(): OnboardingState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OnboardingState) : null;
  } catch {
    return null;
  }
}

/** Saves onboarding state to localStorage — the auto-save mechanism (R3),
 * called on every field change. */
export function saveLocalState(state: OnboardingState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSavedAt: new Date().toISOString() }));
  } catch {
    // localStorage full or unavailable — fail silently, Supabase is the backup (R4).
  }
}

/** Clears local onboarding state — after completion or an explicit "start over". */
export function clearLocalState(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/** The default empty onboarding state. */
export function defaultState(): OnboardingState {
  return {
    providerId: null,
    sessionToken: null,
    currentStep: "register",
    lastSavedAt: null,
    registration: {
      institutionName: "",
      institutionType: "",
      country: "",
      contactName: "",
      contactEmail: "",
      officialWebsite: "",
      domainVerified: null,
    },
    wallet: {
      walletAddress: "",
      walletVerified: null,
      usdcOptedIn: null,
      hasInstitutionalAuthority: null,
    },
    upload: {
      uploadedFiles: [],
      dataTitle: "",
      dataDescription: "",
      dataCategory: "",
      dataSubCategory: "",
      geographyRegion: "",
      timePeriodStart: "",
      timePeriodEnd: "",
      updateFrequency: "",
      methodologySummary: "",
      indigenousDataFlag: null,
      culturalSensitivity: null,
      sensitivityConfirmed: false,
    },
    review: {
      title: "",
      description: "",
      category: "",
      subCategory: "",
      geography: "",
      timePeriodStart: "",
      timePeriodEnd: "",
      // Populated from DEFAULT_REVIEW_PRICING (lib/onboarding/tiers.ts) the
      // first time the review form loads — kept empty here to avoid state.ts
      // depending on tier pricing constants.
      pricing: [],
      sensitivity: {
        noPersonalData: false,
        noTraditionalKnowledge: false,
        noCulturallySensitive: false,
        rightsHeld: false,
        exportControlReviewed: false,
      },
    },
    provenance: {
      methodology: "",
      researchers: [],
      doi: "",
      doiStatus: "unchecked",
      doiVerifiedTitle: null,
      peerReviewStatus: "",
      peerReviewVenue: "",
      fundingSource: "",
      knownLimitations: "",
    },
    deploy: {
      path: "",
      deploymentId: null,
    },
  };
}
