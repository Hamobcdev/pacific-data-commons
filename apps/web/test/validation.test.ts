import { describe, expect, it } from "vitest";
import { registrationSchema, walletSchema, uploadContextSchema } from "../lib/onboarding/validation";

describe("registrationSchema", () => {
  const valid = {
    institutionName: "University of the South Pacific",
    institutionType: "university" as const,
    country: "Fiji",
    contactName: "Dr. Jane Smith",
    contactEmail: "jane@usp.ac.fj",
    officialWebsite: "https://www.usp.ac.fj",
  };

  it("accepts a fully valid registration", () => {
    expect(registrationSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-HTTPS website", () => {
    const result = registrationSchema.safeParse({ ...valid, officialWebsite: "http://www.usp.ac.fj" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = registrationSchema.safeParse({ ...valid, contactEmail: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown institution type", () => {
    const result = registrationSchema.safeParse({ ...valid, institutionType: "spaceship" });
    expect(result.success).toBe(false);
  });
});

describe("walletSchema", () => {
  const wellFormed = "A".repeat(58); // 58 chars, within the A-Z2-7 charset

  it("accepts a well-formed address with authority confirmed", () => {
    const result = walletSchema.safeParse({ walletAddress: wellFormed, hasInstitutionalAuthority: true });
    expect(result.success).toBe(true);
  });

  it("rejects when institutional authority is not confirmed (R7-style gate)", () => {
    const result = walletSchema.safeParse({ walletAddress: wellFormed, hasInstitutionalAuthority: false });
    expect(result.success).toBe(false);
  });

  it("rejects an address of the wrong length", () => {
    const result = walletSchema.safeParse({ walletAddress: "TOOSHORT", hasInstitutionalAuthority: true });
    expect(result.success).toBe(false);
  });

  it("rejects an address with invalid characters", () => {
    const bad = "1".repeat(58); // "1" is not in the Algorand base32 charset (A-Z2-7)
    const result = walletSchema.safeParse({ walletAddress: bad, hasInstitutionalAuthority: true });
    expect(result.success).toBe(false);
  });
});

describe("uploadContextSchema — sovereignty confirmation (R7)", () => {
  const base = {
    dataTitle: "Pacific Tuna Stock Assessment",
    dataDescription: "Synthetic tuna catch volume and stock index data across Samoa and Tonga EEZs.",
    dataCategory: "fisheries" as const,
    geographyRegion: "Samoa EEZ",
    timePeriodStart: "2018",
    timePeriodEnd: "2023",
    methodologySummary: "Aggregated from vessel logbook submissions and observer programme reports.",
    uploadedFiles: [{ id: "file-1", uploadStatus: "complete" as const }],
  };

  it("rejects when indigenousDataFlag has never been answered", () => {
    const result = uploadContextSchema.safeParse({ ...base, culturalSensitivity: "none", sensitivityConfirmed: true });
    expect(result.success).toBe(false);
  });

  it("rejects when sensitivityConfirmed is false, even with valid answers", () => {
    const result = uploadContextSchema.safeParse({
      ...base,
      indigenousDataFlag: false,
      culturalSensitivity: "none",
      sensitivityConfirmed: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts once every field, including the explicit confirmation, is set", () => {
    const result = uploadContextSchema.safeParse({
      ...base,
      indigenousDataFlag: false,
      culturalSensitivity: "none",
      sensitivityConfirmed: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when no files have completed uploading", () => {
    const result = uploadContextSchema.safeParse({
      ...base,
      uploadedFiles: [],
      indigenousDataFlag: false,
      culturalSensitivity: "none",
      sensitivityConfirmed: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when the end year is before the start year", () => {
    const result = uploadContextSchema.safeParse({
      ...base,
      timePeriodStart: "2023",
      timePeriodEnd: "2018",
      indigenousDataFlag: false,
      culturalSensitivity: "none",
      sensitivityConfirmed: true,
    });
    expect(result.success).toBe(false);
  });
});
