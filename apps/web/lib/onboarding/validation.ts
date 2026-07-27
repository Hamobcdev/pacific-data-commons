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
  officialWebsite: z.string().url("A valid website URL is required").startsWith("https://", "Website must use HTTPS"),
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
