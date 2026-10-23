// vanuatuJurisdictionService.ts
//
// Vanuatu jurisdiction intelligence — curated, structured data compiled
// from:
//   - International Companies Act [CAP. 222], Consolidated Edition 2026
//     (Order No. 69 of 2026) — VFSC
//   - Company and Trust Services Providers Act No. 8 of 2010 — VFSC
//   - VFSC live Company and Trust Service Providers directory (vfsc.vu)
//   - Vanuatu Citizenship Office and Commission (vancitizenship.gov.vu)
//   - Council of the European Union / European Commission (EU Schengen
//     visa-exemption suspension instruments)
//
// This is a Decision 61 (Pacific Data Registry) first-party endpoint —
// PDC sells the curated, structured, agent-ready reformatted layer. The
// underlying documents are publicly accessible. PDC does NOT create a
// paywall on those source documents.
//
// Data currency: static regulatory data — updated when legislation
// changes or a pending field is independently re-verified.
// Last verified: October 2026, against the Act text directly and the
// live VFSC directory. See each dataset's data_quality block for which
// fields are confirmed vs. still pending verification.
//
// Fields that could not be confirmed against a primary source are never
// filled with a secondary-source guess. Two distinct null states exist:
//   - pending_verification: no primary source was located at all (either
//     deferred to unlocated Regulations, or only secondary/commercial
//     sources exist)
//   - source_unreachable: a specific primary source was identified but
//     failed to load (DNS failure, 403, TLS error, dead redirect)
// Every nulled field carries a sibling `<field>_data_note` with a fixed,
// generic message — never the underlying secondary-source text or URL,
// per the build brief's "do not expose the raw source note" rule.
//
// IMPORTANT — scope note (not a legal opinion):
// PDC is not a legal adviser. International Companies are prohibited
// from carrying on business in Vanuatu and from owning Vanuatu real
// property (International Companies Act s.10(1)(a)-(b)). Clients must
// engage a VFSC-licensed registered agent before formation.

import { PDC_PLATFORM_CONTEXT } from "./samoaSifaService.js";

export const VANUATU_SOURCE_ATTRIBUTION = {
  source: "Vanuatu Financial Services Commission (VFSC) / Vanuatu Citizenship Office and Commission",
  source_url: "https://www.vfsc.vu",
  legislative_bases: [
    "International Companies Act [CAP. 222], Consolidated Edition 2026 (Order No. 69 of 2026)",
    "Company and Trust Services Providers Act No. 8 of 2010",
  ],
  compiler: "Pacific Data Commons / Synergy Blockchain Pacific",
  data_quality: "curated_regulatory_intelligence" as const,
  last_verified: "2026-10",
  disclaimer:
    "This endpoint provides structured regulatory intelligence compiled from publicly available VFSC and Vanuatu Citizenship Office sources. It is not legal advice. Requirements may change — always verify with a VFSC-licensed registered agent before formation. PDC has not independently confirmed every field directly with VFSC or the Citizenship Office.",
  not_a_paywall_notice:
    "The underlying regulatory documents are publicly accessible via VFSC (vfsc.vu) and the Vanuatu Citizenship Office (vancitizenship.gov.vu). PDC provides the structured, agent-readable layer — not exclusive access to otherwise private documents.",
};

export const VANUATU_OFFICIAL_DOCUMENTS = [
  {
    title: "International Companies Act [CAP. 222], Consolidated Edition 2026",
    url: "https://www.vfsc.vu/wp-content/uploads/2026/04/International-Companies-Act-CAP.-222-Consolidated-Edition-2026.pdf",
  },
  {
    title: "Company and Trust Services Providers Act No. 8 of 2010",
    url: "https://www.vfsc.vu/wp-content/uploads/2025/06/CTSP-ACT_English_Version.pdf",
  },
  {
    title: "VFSC — Company and Trust Service Providers directory",
    url: "https://www.vfsc.vu/company-and-trust-service-providers/",
  },
  {
    title: "Vanuatu Citizenship Office and Commission",
    url: "https://vancitizenship.gov.vu/",
  },
] as const;

const PENDING_VERIFICATION_NOTE = "Pending primary source verification — check back for updates";
const SOURCE_UNREACHABLE_NOTE = "Primary source temporarily unreachable — data withheld pending verification";

function dataQuality(verifiedFields: number, pendingFields: number) {
  return {
    verified_fields: verifiedFields,
    pending_fields: pendingFields,
    jurisdiction: "Vanuatu" as const,
    policy_ref: "PDC-POL-2026-001",
    as_of: "2026-10",
  };
}

export type SourceConfidence = "PRIMARY" | "SECONDARY_LOW" | "NO_DATA";

interface MarketContextInput {
  professionalServicesAlternativeUsd: number | null;
  source: string;
  sourceConfidence: SourceConfidence;
  pdcPriceUsdc: number;
  pdcPriceAsPctOfMarket: string | null;
  note: string;
}

function marketContext(input: MarketContextInput) {
  return {
    professional_services_alternative_usd: input.professionalServicesAlternativeUsd,
    source: input.source,
    source_confidence: input.sourceConfidence,
    pdc_price_usdc: input.pdcPriceUsdc,
    pdc_price_as_pct_of_market: input.pdcPriceAsPctOfMarket,
    note: input.note,
  };
}

// ─── vanuatu-ibc-setup ───────────────────────────────────────────────────────

export interface VanuatuIbcSetup {
  entity_type: string;
  formation_fee_usd: number;
  long_term_formation_fee_usd: { "5_year": number; "10_year": number; "20_year": number };
  long_term_renewal_fee_usd: { "5_year": number; "10_year": number; "20_year": number };
  annual_registration_fee_usd: number;
  late_fee_usd: number;
  minimum_capital_requirement: number | null;
  minimum_capital_note: string;
  registered_agent_required: boolean;
  registered_agent_note: string;
  directors_minimum: number;
  directors_residency_required: boolean;
  directors_may_be_body_corporate: boolean;
  shareholders_minimum: number;
  bearer_shares_permitted: boolean;
  bearer_shares_penalty: string;
  timeline_to_incorporation_days: number | null;
  timeline_to_incorporation_days_data_note?: string;
  fiac_applies_to_pure_ibc: boolean;
  fiac_note: string;
}

const IBC_SETUP: VanuatuIbcSetup = {
  entity_type: "International Company (IBC) under International Companies Act [CAP. 222]",
  formation_fee_usd: 150,
  long_term_formation_fee_usd: { "5_year": 675, "10_year": 1200, "20_year": 2000 },
  long_term_renewal_fee_usd: { "5_year": 1000, "10_year": 1500, "20_year": 2500 },
  annual_registration_fee_usd: 300,
  late_fee_usd: 100,
  // Confirmed absence, not missing data — no minimum capital requirement
  // is stated anywhere in Parts 2 or 4 (ss.15-33) of the Act.
  minimum_capital_requirement: null,
  minimum_capital_note: "No minimum capital requirement. Shares may be issued with no par value.",
  registered_agent_required: true,
  registered_agent_note: "Mandatory at all times. Must be licensed under CTSP Act No.8 of 2010 s.15(1)(a).",
  directors_minimum: 1,
  directors_residency_required: false,
  directors_may_be_body_corporate: true,
  shareholders_minimum: 1,
  bearer_shares_permitted: false,
  bearer_shares_penalty: "Fine not exceeding VT 125,000,000",
  timeline_to_incorporation_days: null,
  timeline_to_incorporation_days_data_note: PENDING_VERIFICATION_NOTE,
  fiac_applies_to_pure_ibc: false,
  fiac_note:
    "International Companies are prohibited from carrying on business in Vanuatu (s.10(1)(a)). FIAC is not required for a pure offshore IBC.",
};

export interface IbcSetupResult {
  jurisdiction: "Vanuatu";
  iso_code: "VU";
  ibc_setup: VanuatuIbcSetup;
  official_documents: typeof VANUATU_OFFICIAL_DOCUMENTS;
  platform_context: typeof PDC_PLATFORM_CONTEXT;
  data_quality: ReturnType<typeof dataQuality>;
  market_context: ReturnType<typeof marketContext>;
  reseller_market_range_usd: { low: number; high: number };
  reseller_market_note: string;
  policy_ref: "PDC-POL-2026-001";
  fetched_at: string;
  attribution: typeof VANUATU_SOURCE_ATTRIBUTION;
}

export function getIbcSetup(): IbcSetupResult {
  return {
    jurisdiction: "Vanuatu",
    iso_code: "VU",
    ibc_setup: IBC_SETUP,
    official_documents: VANUATU_OFFICIAL_DOCUMENTS,
    platform_context: PDC_PLATFORM_CONTEXT,
    data_quality: dataQuality(14, 1),
    market_context: marketContext({
      professionalServicesAlternativeUsd: 600,
      source: "Geoffrey Gee & Partners (ggp.com.vu) — named in-jurisdiction law firm, own published rate card, reviewed yearly",
      sourceConfidence: "PRIMARY",
      pdcPriceUsdc: 1.3,
      pdcPriceAsPctOfMarket: "0.22%",
      note: "PDC delivers equivalent IBC formation intelligence at 0.22% of the cost of engaging a Port Vila law firm directly.",
    }),
    reseller_market_range_usd: { low: 1200, high: 3500 },
    reseller_market_note:
      "Cross-check only — secondary aggregator sources, not a named firm. Use Geoffrey Gee primary rate for pricing decisions.",
    policy_ref: "PDC-POL-2026-001",
    fetched_at: new Date().toISOString(),
    attribution: VANUATU_SOURCE_ATTRIBUTION,
  };
}

// ─── vanuatu-ibc-compliance ──────────────────────────────────────────────────

export interface VanuatuIbcCompliance {
  beneficial_ownership_register_visibility: string;
  beneficial_ownership_held_by: string[];
  beneficial_ownership_disclosure_gateways: string[];
  unauthorized_disclosure_penalty_usd: number;
  unauthorized_disclosure_penalty_imprisonment_years: number;
  annual_return_required: boolean;
  annual_return_note: string;
  aml_fatf_status: string | null;
  aml_fatf_status_data_note?: string;
  foreign_investment_act_2019_prohibited_sectors: string[] | null;
  foreign_investment_act_2019_prohibited_sectors_data_note?: string;
}

const IBC_COMPLIANCE: VanuatuIbcCompliance = {
  beneficial_ownership_register_visibility: "Private/confidential",
  beneficial_ownership_held_by: ["Registered agent", "VFSC (on request via s.35A notice)"],
  beneficial_ownership_disclosure_gateways: [
    "Court order",
    "Financial Intelligence Unit",
    "AML/CFT supervisor",
    "Law enforcement (offence threshold VT 1,000,000 / 12 months+)",
    "Domestic regulator",
    "Sanctions Secretariat",
    "Foreign government agency under agreement or specified conditions",
  ],
  unauthorized_disclosure_penalty_usd: 100000,
  unauthorized_disclosure_penalty_imprisonment_years: 5,
  annual_return_required: false,
  annual_return_note:
    "International Companies do not file a conventional annual return. VFSC must be updated on incorporators, registered office, registered agent, and property charges.",
  // Only secondary reporting found, not independently re-verified against
  // FATF's own site — pending_verification, not source_unreachable.
  aml_fatf_status: null,
  aml_fatf_status_data_note: PENDING_VERIFICATION_NOTE,
  // A specific primary source (ILO NATLEX / UNCTAD) was identified and
  // attempted but failed to load (redirect loop / 403) — source_unreachable.
  foreign_investment_act_2019_prohibited_sectors: null,
  foreign_investment_act_2019_prohibited_sectors_data_note: SOURCE_UNREACHABLE_NOTE,
};

export interface IbcComplianceResult {
  jurisdiction: "Vanuatu";
  iso_code: "VU";
  ibc_compliance: VanuatuIbcCompliance;
  official_documents: typeof VANUATU_OFFICIAL_DOCUMENTS;
  platform_context: typeof PDC_PLATFORM_CONTEXT;
  data_quality: ReturnType<typeof dataQuality>;
  market_context: ReturnType<typeof marketContext>;
  policy_ref: "PDC-POL-2026-001";
  fetched_at: string;
  attribution: typeof VANUATU_SOURCE_ATTRIBUTION;
}

export function getIbcCompliance(): IbcComplianceResult {
  return {
    jurisdiction: "Vanuatu",
    iso_code: "VU",
    ibc_compliance: IBC_COMPLIANCE,
    official_documents: VANUATU_OFFICIAL_DOCUMENTS,
    platform_context: PDC_PLATFORM_CONTEXT,
    data_quality: dataQuality(6, 2),
    market_context: marketContext({
      professionalServicesAlternativeUsd: null,
      source: "No published rate found for standalone compliance advice across 8 Pacific jurisdictions researched (October 2026)",
      sourceConfidence: "NO_DATA",
      pdcPriceUsdc: 0.6,
      pdcPriceAsPctOfMarket: null,
      note: "Standalone compliance advisory rates are not publicly published in Vanuatu or peer Pacific jurisdictions. PDC provides this intelligence at a fixed $0.60 per query.",
    }),
    policy_ref: "PDC-POL-2026-001",
    fetched_at: new Date().toISOString(),
    attribution: VANUATU_SOURCE_ATTRIBUTION,
  };
}

// ─── vanuatu-vfsc-licenses ───────────────────────────────────────────────────

export interface VanuatuVfscLicenses {
  license_categories: string[];
  fit_and_proper_criteria: string[];
  processing_timeline_months: number;
  processing_timeline_note: string;
  annual_license_fee: number | null;
  annual_license_fee_data_note?: string;
  minimum_capital: number | null;
  minimum_capital_data_note?: string;
  vasp_framework: string | null;
  vasp_framework_data_note?: string;
  data_caveat: string;
}

const VFSC_LICENSES: VanuatuVfscLicenses = {
  license_categories: [
    "CTSP (Company and Trust Service Provider)",
    "General CSP",
    "Limited CSP",
    "Director's Licence",
    "Special Trust Licence",
    "Group Licence",
  ],
  fit_and_proper_criteria: [
    "Applicant business must be financially viable",
    "Services must not bring Vanuatu into disrepute as an international financial centre",
    "Applicant and each controller/director/manager individually fit and proper",
    "Minimum 2 managers required (except Director's Licence)",
    "Special Trust Licence: at least 2 directors who are legal practitioners or accountants, clean 5-year record",
    "At least one manager must reside in Vanuatu",
  ],
  processing_timeline_months: 3,
  processing_timeline_note: "Commission must decide within 3 months of complete application or it is deemed approved.",
  // Act defers these amounts to Regulations which were not located —
  // pending_verification for all three.
  annual_license_fee: null,
  annual_license_fee_data_note: PENDING_VERIFICATION_NOTE,
  minimum_capital: null,
  minimum_capital_data_note: PENDING_VERIFICATION_NOTE,
  vasp_framework: null,
  vasp_framework_data_note: PENDING_VERIFICATION_NOTE,
  data_caveat:
    "Based on the Company and Trust Services Providers Act No. 8 of 2010 original text. 2017 and 2018 amendments not yet incorporated. Fee amounts deferred to Regulations, not yet located.",
};

export interface VfscLicensesResult {
  jurisdiction: "Vanuatu";
  iso_code: "VU";
  vfsc_licenses: VanuatuVfscLicenses;
  official_documents: typeof VANUATU_OFFICIAL_DOCUMENTS;
  platform_context: typeof PDC_PLATFORM_CONTEXT;
  data_quality: ReturnType<typeof dataQuality>;
  market_context: ReturnType<typeof marketContext>;
  policy_ref: "PDC-POL-2026-001";
  fetched_at: string;
  attribution: typeof VANUATU_SOURCE_ATTRIBUTION;
}

export function getVfscLicenses(): VfscLicensesResult {
  return {
    jurisdiction: "Vanuatu",
    iso_code: "VU",
    vfsc_licenses: VFSC_LICENSES,
    official_documents: VANUATU_OFFICIAL_DOCUMENTS,
    platform_context: PDC_PLATFORM_CONTEXT,
    data_quality: dataQuality(3, 3),
    market_context: marketContext({
      professionalServicesAlternativeUsd: 37500,
      source: "Aggregated search synthesis — secondary, low confidence. Source PDF failed to parse. Range reported: $25,000–$50,000.",
      sourceConfidence: "SECONDARY_LOW",
      pdcPriceUsdc: 1.0,
      pdcPriceAsPctOfMarket: "0.003%",
      note: "Financial services licensing advisory in Vanuatu typically costs $25,000–$50,000 through a specialist firm. PDC delivers the licensing framework intelligence at $1.00 per query.",
    }),
    policy_ref: "PDC-POL-2026-001",
    fetched_at: new Date().toISOString(),
    attribution: VANUATU_SOURCE_ATTRIBUTION,
  };
}

// ─── vanuatu-registered-agents ───────────────────────────────────────────────

export interface VanuatuLicensedCtsp {
  name: string;
  rid: string;
  address: string;
  phone?: string;
  website?: string;
  email: string;
}

export const VANUATU_LICENSED_CTSPS: VanuatuLicensedCtsp[] = [
  { name: "European Trust Company Limited", rid: "57", address: "International Building, P.O. Box 45, Kumul Highway, Port-Vila", phone: "+678 23410", email: "pitco@vila.net" },
  { name: "International Finance Trust Company Ltd", rid: "15", address: "P.O. Box 211, 1st Floor iCOUNT House, Kumul Highway, Port-Vila", phone: "+678 22159", website: "http://www.icount.biz", email: "info@icount.biz" },
  { name: "Pacific International Trust Company Ltd", rid: "13", address: "International Building, P.O. Box 45, Kumul Highway, Port-Vila", phone: "+678 23410", email: "pitco@vila.net" },
  { name: "Transpacific Trust Limited", rid: "19", address: "2nd Floor Transpacific Haus, Kumul Highway, P.O. Box 257, Port Vila", phone: "+678 22291", email: "mooresrowland@vanuatu.com.vu" },
  { name: "Trustees International Ltd", rid: "04", address: "1st Floor B&P House, P.O. Box 240, Lini Highway, Port-Vila", phone: "+678 22280", website: "https://bap-international.com/", email: "service@bap.com.vu" },
  { name: "Vanuatu Glory Limited", rid: "77", address: "Champagne Estates, P.O. Box 1343, Port-Vila", email: "ed@3dco.co" },
];

export const VANUATU_REGISTER_AS_OF = "2026-10";
export const VANUATU_REGISTER_SOURCE = "VFSC live directory — https://www.vfsc.vu/company-and-trust-service-providers/";

export interface RegisteredAgentsResult {
  jurisdiction: "Vanuatu";
  regulator: "VFSC";
  total_licensed_ctsps: number;
  register_as_of: string;
  register_source: string;
  licensed_ctsps: VanuatuLicensedCtsp[];
  important_notice: string;
  official_documents: typeof VANUATU_OFFICIAL_DOCUMENTS;
  platform_context: typeof PDC_PLATFORM_CONTEXT;
  data_quality: ReturnType<typeof dataQuality>;
  market_context: ReturnType<typeof marketContext>;
  policy_ref: "PDC-POL-2026-001";
  fetched_at: string;
  attribution: typeof VANUATU_SOURCE_ATTRIBUTION;
}

export function getRegisteredAgents(): RegisteredAgentsResult {
  return {
    jurisdiction: "Vanuatu",
    regulator: "VFSC",
    total_licensed_ctsps: VANUATU_LICENSED_CTSPS.length,
    register_as_of: VANUATU_REGISTER_AS_OF,
    register_source: VANUATU_REGISTER_SOURCE,
    licensed_ctsps: VANUATU_LICENSED_CTSPS,
    important_notice:
      "This directory lists licensed Company and Trust Service Providers as of the register_as_of date above — a live VFSC register that changes as licenses are issued or revoked. Always verify current license status directly with VFSC before engaging any provider.",
    official_documents: VANUATU_OFFICIAL_DOCUMENTS,
    platform_context: PDC_PLATFORM_CONTEXT,
    data_quality: dataQuality(1, 0),
    market_context: marketContext({
      professionalServicesAlternativeUsd: null,
      source: "Registered agent directory data — no professional services advisory fee applicable. VFSC public directory is free to access but requires manual lookup and verification.",
      sourceConfidence: "NO_DATA",
      pdcPriceUsdc: 0.6,
      pdcPriceAsPctOfMarket: null,
      note: "PDC delivers a verified, structured snapshot of all licensed Vanuatu CTSPs at $0.60 per query, saving manual VFSC directory lookup and parsing time.",
    }),
    policy_ref: "PDC-POL-2026-001",
    fetched_at: new Date().toISOString(),
    attribution: VANUATU_SOURCE_ATTRIBUTION,
  };
}

// ─── vanuatu-citizenship-investment ──────────────────────────────────────────

export interface VanuatuCitizenshipInvestment {
  programme_name: string;
  administering_body: string;
  official_site: string;
  contact_address: string;
  contact_phone: string[];
  contact_email: string;
  contribution_amounts_usd: Record<string, number> | null;
  contribution_amounts_usd_data_note?: string;
  real_estate_option_usd: number | null;
  real_estate_option_usd_data_note?: string;
  eu_schengen_status: string;
  eu_partial_suspension_date: string;
  eu_full_temporary_suspension_date: string;
  eu_permanent_removal_date: string;
  eu_permanent_removal_instrument: string;
  uk_visa_free_access: boolean | null;
  uk_visa_free_access_data_note?: string;
}

const CITIZENSHIP_INVESTMENT: VanuatuCitizenshipInvestment = {
  programme_name: "Vanuatu Development Support Programme (DSP / VDSP)",
  administering_body: "Vanuatu Citizenship Office and Commission",
  official_site: "https://vancitizenship.gov.vu/",
  contact_address: "PMB 9004 Port Vila, Vanuatu",
  contact_phone: ["+678 26716", "+678 33365"],
  contact_email: "vancitizenship@vanuatu.gov.vu",
  // Only commercial/secondary sources found — official site's own fee
  // schedule sub-page not independently confirmed.
  contribution_amounts_usd: null,
  contribution_amounts_usd_data_note: PENDING_VERIFICATION_NOTE,
  real_estate_option_usd: null,
  real_estate_option_usd_data_note: PENDING_VERIFICATION_NOTE,
  eu_schengen_status: "Permanently suspended",
  eu_partial_suspension_date: "2022-03-03",
  eu_full_temporary_suspension_date: "2023-02-04",
  eu_permanent_removal_date: "2024-12-12",
  eu_permanent_removal_instrument: "Regulation (EU) 2025/11, Council of the European Union",
  uk_visa_free_access: null,
  uk_visa_free_access_data_note: PENDING_VERIFICATION_NOTE,
};

export interface CitizenshipInvestmentResult {
  jurisdiction: "Vanuatu";
  iso_code: "VU";
  citizenship_investment: VanuatuCitizenshipInvestment;
  official_documents: typeof VANUATU_OFFICIAL_DOCUMENTS;
  platform_context: typeof PDC_PLATFORM_CONTEXT;
  data_quality: ReturnType<typeof dataQuality>;
  market_context: ReturnType<typeof marketContext>;
  eu_schengen_advisory_note: string;
  policy_ref: "PDC-POL-2026-001";
  fetched_at: string;
  attribution: typeof VANUATU_SOURCE_ATTRIBUTION;
}

export function getCitizenshipInvestment(): CitizenshipInvestmentResult {
  return {
    jurisdiction: "Vanuatu",
    iso_code: "VU",
    citizenship_investment: CITIZENSHIP_INVESTMENT,
    official_documents: VANUATU_OFFICIAL_DOCUMENTS,
    platform_context: PDC_PLATFORM_CONTEXT,
    data_quality: dataQuality(11, 3),
    market_context: marketContext({
      professionalServicesAlternativeUsd: null,
      source: "No published standalone agent advisory fee found. Commercial sources cite government contribution amounts ($130,000–$180,000) but authorised agent fees are bundled and not published separately.",
      sourceConfidence: "NO_DATA",
      pdcPriceUsdc: 1.3,
      pdcPriceAsPctOfMarket: null,
      note: "PDC provides DSP programme intelligence including the verified EU Schengen suspension status — a critical due-diligence data point for any citizenship-by-investment enquiry — at $1.30 per query.",
    }),
    eu_schengen_advisory_note:
      "The permanent removal of Vanuatu from the EU visa-exempt list (Regulation (EU) 2025/11, effective 2024-12-12) is a material fact for any citizenship-by-investment buyer. PDC is one of the few structured data sources that surfaces this with primary EU institutional citations.",
    policy_ref: "PDC-POL-2026-001",
    fetched_at: new Date().toISOString(),
    attribution: VANUATU_SOURCE_ATTRIBUTION,
  };
}
