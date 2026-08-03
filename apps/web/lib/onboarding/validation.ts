import { z } from "zod";
import type { CulturalSensitivity, DataCategory, InstitutionType } from "@pdc/shared-types";

const INSTITUTION_TYPES: [InstitutionType, ...InstitutionType[]] = [
  "university",
  "government",
  "ngo",
  "private",
  "cultural",
  "intergovernmental",
];

export const CULTURAL_SENSITIVITY_LEVELS: [CulturalSensitivity, ...CulturalSensitivity[]] = ["none", "low", "medium", "high"];

export const registrationSchema = z.object({
  institutionName: z.string().min(2, "Institution name must be at least 2 characters").max(200, "Institution name is too long"),
  institutionType: z.enum(INSTITUTION_TYPES, { required_error: "Please select an institution type" }),
  country: z.string().min(1, "Country is required"),
  contactName: z.string().min(2, "Contact name is required"),
  contactEmail: z.string().email("A valid institutional email address is required"),
  // .trim() before the checks below matters: the domain-verification effect
  // in RegistrationForm parses this same value with `new URL()`, which
  // silently tolerates leading/trailing whitespace (e.g. from a pasted
  // link) — so "Domain verified" can show green while this schema's
  // .startsWith("https://") still fails on the untrimmed string, disabling
  // Continue with no visible reason. Trimming here keeps both checks
  // consistent with what the user sees.
  officialWebsite: z.string().trim().url("A valid website URL is required").startsWith("https://", "Website must use HTTPS"),
});

export const walletSchema = z.object({
  walletAddress: z
    .string()
    .length(58, "Algorand addresses are 58 characters")
    .regex(/^[A-Z2-7]{58}$/, "This does not look like a valid Algorand address"),
  // z.literal(true) with a custom refine message — avoids relying on a
  // specific zod-version literal()-errorMap signature.
  hasInstitutionalAuthority: z
    .boolean()
    .refine((v) => v === true, {
      message: "You must confirm you have authority to receive payments on behalf of your institution",
    }),
});

export const DATA_CATEGORIES: [DataCategory, ...DataCategory[]] = [
  "fisheries",
  "climate",
  "trade",
  "demographics",
  "health",
  "agriculture",
  "cultural",
  "remittance",
  "legal",
  "geospatial",
  "energy",
  "carbon",
  "tourism",
  "disaster_risk",
  "biodiversity",
  "ocean",
  "education",
  "other",
];

export const uploadContextSchema = z.object({
  dataTitle: z.string().min(5, "Please provide a descriptive title").max(200),
  dataDescription: z.string().min(20, "Please describe your data in more detail").max(2000),
  dataCategory: z.enum(DATA_CATEGORIES, { required_error: "Please select a data category" }),
  geographyRegion: z.string().min(2, "Geographic coverage is required"),
  timePeriodStart: z
    .string()
    .regex(/^\d{4}$/, "Enter a 4-digit year")
    .refine((y) => Number(y) <= new Date().getFullYear(), "Start year cannot be in the future"),
  timePeriodEnd: z.string().regex(/^\d{4}$/, "Enter a 4-digit year"),
  methodologySummary: z.string().min(20, "Please describe how the data was collected").max(1000),
  // Sensitivity fields must be explicitly confirmed (R7) — no default, no
  // silent bulk-accept. required_error fires when the field is still null
  // (the initial, unconfirmed state).
  indigenousDataFlag: z.boolean({ required_error: "Please confirm whether this data contains indigenous or traditional knowledge" }),
  culturalSensitivity: z.enum(CULTURAL_SENSITIVITY_LEVELS, { required_error: "Please select a cultural sensitivity level" }),
  sensitivityConfirmed: z
    .boolean()
    .refine((v) => v === true, {
      message: "You must explicitly confirm your sensitivity selection — this cannot be skipped",
    }),
  uploadedFiles: z
    .array(z.object({ id: z.string(), uploadStatus: z.literal("complete") }))
    .min(1, "Please upload at least one file before continuing"),
}).refine((data) => Number(data.timePeriodStart) <= Number(data.timePeriodEnd), {
  message: "Start year must be before or the same as the end year",
  path: ["timePeriodEnd"],
});

export type RegistrationData = z.infer<typeof registrationSchema>;
export type WalletData = z.infer<typeof walletSchema>;
export type UploadContextData = z.infer<typeof uploadContextSchema>;

// ============================================================================
// Step 4 — Review
// ============================================================================

const reviewPricingRowSchema = z.object({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  name: z.string(),
  description: z.string(),
  aiSuggestedPriceUsdc: z.number(),
  overridePriceUsdc: z.string(),
});

/**
 * R7 / CLAUDE.md P9: each sensitivity confirmation must be individually
 * `true` — z.literal(true) on every field means a partially-confirmed form
 * fails validation with a field-specific error, never a silent bulk pass.
 */
const reviewSensitivitySchema = z.object({
  noPersonalData: z.literal(true, { errorMap: () => ({ message: "Please confirm this data does not contain personally identifiable information" }) }),
  noTraditionalKnowledge: z.literal(true, {
    errorMap: () => ({ message: "Please confirm this data does not contain traditional ecological knowledge requiring community consent" }),
  }),
  noCulturallySensitive: z.literal(true, { errorMap: () => ({ message: "Please confirm this data does not contain culturally sensitive material" }) }),
  rightsHeld: z.literal(true, { errorMap: () => ({ message: "Please confirm you hold the rights to publish and license this dataset" }) }),
  exportControlReviewed: z.literal(true, { errorMap: () => ({ message: "Please confirm you have reviewed the export control requirements for this data" }) }),
});

export const reviewSchema = z
  .object({
    title: z.string().min(5, "Please provide a descriptive title").max(200),
    description: z.string().min(20, "Please describe your data in more detail").max(500),
    category: z.enum(DATA_CATEGORIES, { required_error: "Please select a data category" }),
    subCategory: z.string().max(200).optional().default(""),
    geography: z.string().min(2, "Geographic coverage is required"),
    timePeriodStart: z.string().regex(/^\d{4}$/, "Enter a 4-digit year"),
    timePeriodEnd: z.string().regex(/^\d{4}$/, "Enter a 4-digit year"),
    pricing: z
      .array(reviewPricingRowSchema)
      .refine((rows) => rows.some((row) => Number(row.overridePriceUsdc) > 0), {
        message: "At least one pricing tier must have a price greater than $0",
      }),
    sensitivity: reviewSensitivitySchema,
  })
  .refine((data) => Number(data.timePeriodStart) <= Number(data.timePeriodEnd), {
    message: "Start year must be before or the same as the end year",
    path: ["timePeriodEnd"],
  });

export type ReviewData = z.infer<typeof reviewSchema>;

// ============================================================================
// Step 5 — Provenance
// ============================================================================

export const provenanceSchema = z.object({
  methodology: z.string().min(20, "Please describe your methodology in more detail").max(2000),
  researchers: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        orcid: z.string(),
        orcidStatus: z.enum(["unchecked", "checking", "verified", "manual"]),
        orcidVerifiedName: z.string().nullable(),
      }),
    )
    .min(1, "Please add at least one researcher")
    .refine((researchers) => researchers.some((r) => r.name.trim().length > 0), {
      message: "Please provide at least one researcher name",
    }),
  doi: z.string().optional().default(""),
  doiStatus: z.enum(["unchecked", "checking", "verified", "manual"]),
  doiVerifiedTitle: z.string().nullable(),
  peerReviewStatus: z.enum(["none", "under-review", "published", ""]),
  peerReviewVenue: z.string().optional().default(""),
  fundingSource: z.string().optional().default(""),
  knownLimitations: z.string().max(2000).optional().default(""),
});

export type ProvenanceData = z.infer<typeof provenanceSchema>;
