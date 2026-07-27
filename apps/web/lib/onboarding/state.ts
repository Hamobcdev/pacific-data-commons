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

/** The complete onboarding state across all 7 steps. Persists to
 * localStorage on every change (R3) and to Supabase per-step via server
 * actions (R4) — see saveLocalState() below and actions/onboarding/*.ts. */
export interface OnboardingState {
  providerId: string | null; // set after Step 1 creates the DB record
  sessionToken: string | null; // reserved for magic-link resume correlation
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

  // Steps 4-7 — populated in Session 6
  review: Record<string, unknown>;
  provenance: Record<string, unknown>;
  deploy: Record<string, unknown>;
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
    review: {},
    provenance: {},
    deploy: {},
  };
}
