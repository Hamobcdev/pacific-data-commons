// samoaSifaService.ts
//
// Samoa SIFA regulatory intelligence — curated, structured data compiled
// from:
//   - Samoa International Finance Authority (SIFA) Act 2005 and amendments
//   - International Companies Act 1987 (Samoa IBC legislation)
//   - Charitable Trusts Act 2009 (Samoa)
//   - International Banking Act 2005
//   - SIFA official website (sifa.ws) and regulatory publications
//   - Samoa Ministry of Commerce, Industry and Labour (MCIL) registry
//   - FATF / OECD country risk assessments
//   - EU jurisdictions list decisions (as updated)
//   - Financial Intelligence Unit Samoa (FIU) AML/CFT guidance
//
// This is a Decision 61 (Pacific Data Registry) first-party endpoint —
// PDC sells the curated, structured, agent-ready reformatted layer.
// The underlying documents are publicly accessible (sifa.ws, SIFA Act,
// MCIL registry). PDC does NOT create a paywall on those source documents.
// Every response names the authoritative source for every field.
//
// Data currency: static regulatory data — updated when legislation changes.
// Last verified: October 2026 against SIFA website and Samoa Law Reform
// Commission consolidated statutes.
//
// Pricing: $1.00-$5.00 USDC per endpoint, tiered by complexity (Decision 63
// — Samoa Jurisdiction Intelligence). This is SBP-curated regulatory
// intelligence (research, structuring, maintenance by SBP), not a Decision
// 60 open-data wrapper, so the Decision 60 $0.01 cap does not apply. See
// routeSchemas.ts's SAMOA_*_PRICE_USDC constants for the per-route prices.
//
// IMPORTANT — AML/CFT safeguard (in every response):
// Samoa requires UBO disclosure for any beneficial owner with ≥25%
// interest/control to the Financial Intelligence Unit. All responses
// include this requirement prominently. PDC is not a legal adviser.
// Clients must engage a SIFA-licensed registered agent before formation.

export const SIFA_SOURCE_ATTRIBUTION = {
  source: "Samoa International Finance Authority (SIFA)",
  source_url: "https://www.sifa.ws",
  legislative_bases: [
    "International Companies Act 1987 (as amended)",
    "Samoa International Finance Authority Act 2005",
    "International Banking Act 2005",
    "Money Laundering Prevention Act 2007 (MLPA 2007)",
    "Charitable Trusts Act 2009",
  ],
  compiler: "Pacific Data Commons / Synergy Blockchain Pacific",
  data_quality: "curated_regulatory_intelligence" as const,
  last_verified: "2026-10",
  disclaimer:
    "This endpoint provides structured regulatory intelligence compiled from publicly available SIFA and MCIL sources. It is not legal advice. Requirements may change — always verify with a SIFA-licensed registered agent before formation. PDC has not independently confirmed all details with SIFA directly.",
  not_a_paywall_notice:
    "The underlying regulatory documents are publicly accessible at sifa.ws, the SIFA Act, and the Samoa Law Reform Commission consolidated statutes. PDC provides the structured, agent-readable layer — not exclusive access to otherwise private documents.",
};

// Confirmed-live PacLII URLs — same two source documents cited across all
// four Samoa Jurisdiction Intelligence endpoints.
export const SIFA_OFFICIAL_DOCUMENTS = [
  {
    title: "International Banking Act 2005 (2025 consolidation)",
    url: "https://pacliirms.paclii.org/ws/legis/consol_act_2025/iba2005211.pdf",
  },
  {
    title: "SIFA Act 2005 (2023 consolidation)",
    url: "https://pacliirms.austlii.edu.au/ws/legis/consol_act_2023/sifaa2005377.pdf",
  },
] as const;

// Decision 61/62 layer status, surfaced on every Samoa Jurisdiction
// Intelligence response per Decision 63's build brief.
export const PDC_PLATFORM_CONTEXT = {
  layer: 1,
  layer_description: "Pacific Data Registry — curated regulatory intelligence service",
  layer_2_status: "under_construction" as const,
  layer_2_description: "OGIP — Pacific government data exchange and ministry interoperability layer",
  layer_3_status: "planned" as const,
  layer_3_description: "Sovereign node network — nation-hosted infrastructure with PDC as routing and discovery layer",
  partnership_enquiries: "anthony@synergybcpacific.com",
} as const;

// ─── Entity Types ──────────────────────────────────────────────────────────

export type SamoaEntityType = "ibc" | "trust" | "foundation" | "international_bank" | "insurance" | "partnership" | "mutual_fund";

export interface EntityRequirements {
  entity_type: SamoaEntityType;
  entity_type_label: string;
  governing_legislation: string;
  regulator: "SIFA" | "MCIL" | "SIFA_and_MCIL";
  minimum_shareholders: number | null;
  minimum_directors: number | null;
  minimum_paid_up_capital_usd: number | null;
  nationality_restrictions: string;
  registered_agent_required: boolean;
  registered_office_samoa_required: boolean;
  annual_return_required: boolean;
  annual_audit_required: boolean;
  ubo_disclosure_threshold_pct: number;
  ubo_disclosure_to: string;
  ubo_disclosure_public: boolean;
  tax_treatment: string;
  formation_timeline_typical: string;
  annual_fee_usd_approx: number | null;
  formation_fee_usd_approx: number | null;
  key_restrictions: string[];
  key_benefits: string[];
  notes: string;
}

const ENTITY_REQUIREMENTS: Record<SamoaEntityType, EntityRequirements> = {
  ibc: {
    entity_type: "ibc",
    entity_type_label: "International Business Company (IBC)",
    governing_legislation: "International Companies Act 1987",
    regulator: "SIFA",
    minimum_shareholders: 1,
    minimum_directors: 1,
    minimum_paid_up_capital_usd: null, // no statutory minimum
    nationality_restrictions: "None — shareholder can be any nationality or itself a company of any jurisdiction",
    registered_agent_required: true,
    registered_office_samoa_required: true,
    annual_return_required: true,
    annual_audit_required: false,
    ubo_disclosure_threshold_pct: 25,
    ubo_disclosure_to: "Financial Intelligence Unit (FIU) Samoa — not publicly disclosed",
    ubo_disclosure_public: false,
    tax_treatment: "Zero tax on income earned outside Samoa. Exempt from Samoa income tax, stamp duty, and withholding tax on dividends to non-resident shareholders.",
    formation_timeline_typical: "1–3 business days once registered agent submits",
    annual_fee_usd_approx: 300,
    formation_fee_usd_approx: 500,
    key_restrictions: [
      "Cannot conduct business within Samoa (cannot be a domestic operating company)",
      "Cannot own real property in Samoa",
      "Cannot conduct banking, insurance, or fund management without additional SIFA licence",
      "Must maintain Samoa registered agent at all times",
      "AML/CFT programme required at formation (MLPA 2007)",
    ],
    key_benefits: [
      "Single shareholder and single director (same person permitted)",
      "Director nationality unrestricted",
      "No minimum capital requirement",
      "Bearer shares not permitted (post-2014 reform)",
      "High confidentiality — register not publicly searchable beyond basic registration",
      "Samoa removed from EU blacklist February 2026 following legislative reforms",
    ],
    notes:
      "The IBC is the most commonly used structure for international holding, IP, and trading companies. Shares must be registered — bearer shares abolished. AML/CFT reforms in 2023–2025 brought Samoa into FATF compliance.",
  },

  trust: {
    entity_type: "trust",
    entity_type_label: "International Trust",
    governing_legislation: "International Trusts Act 1987",
    regulator: "SIFA",
    minimum_shareholders: null,
    minimum_directors: null,
    minimum_paid_up_capital_usd: null,
    nationality_restrictions: "Settlor must be non-resident. Trustee must be a SIFA-licensed trustee company.",
    registered_agent_required: true,
    registered_office_samoa_required: true,
    annual_return_required: true,
    annual_audit_required: false,
    ubo_disclosure_threshold_pct: 25,
    ubo_disclosure_to: "Financial Intelligence Unit (FIU) Samoa — not publicly disclosed",
    ubo_disclosure_public: false,
    tax_treatment: "Exempt from Samoa tax on income and gains outside Samoa. No inheritance tax.",
    formation_timeline_typical: "3–5 business days",
    annual_fee_usd_approx: 600,
    formation_fee_usd_approx: 1000,
    key_restrictions: [
      "Trustee must be a SIFA-licensed trustee company — individual cannot serve as trustee",
      "Settlor must be non-resident of Samoa",
      "Trust instrument must be in English or certified translation",
      "Cannot be used for Samoa domestic business",
    ],
    key_benefits: [
      "Strong asset protection provisions",
      "Spendthrift clauses enforceable",
      "STAR trust mechanism available (Specific Purpose Trust)",
      "Confidential — trust deed not publicly registered",
    ],
    notes: "Commonly used for estate planning, asset protection, and succession planning. Trustee must be one of the 10 SIFA-licensed trustee companies.",
  },

  foundation: {
    entity_type: "foundation",
    entity_type_label: "International Foundation",
    governing_legislation: "Samoa International Finance Authority Act 2005 — Foundation provisions",
    regulator: "SIFA",
    minimum_shareholders: null,
    minimum_directors: null,
    minimum_paid_up_capital_usd: null,
    nationality_restrictions: "Founder must be non-resident",
    registered_agent_required: true,
    registered_office_samoa_required: true,
    annual_return_required: true,
    annual_audit_required: false,
    ubo_disclosure_threshold_pct: 25,
    ubo_disclosure_to: "Financial Intelligence Unit (FIU) Samoa — not publicly disclosed",
    ubo_disclosure_public: false,
    tax_treatment: "Exempt from Samoa tax on income from outside Samoa",
    formation_timeline_typical: "3–5 business days",
    annual_fee_usd_approx: 500,
    formation_fee_usd_approx: 800,
    key_restrictions: [
      "Must maintain SIFA-licensed registered agent",
      "Cannot conduct domestic business in Samoa",
    ],
    key_benefits: [
      "Civil law equivalent of a trust — useful for clients from civil law jurisdictions",
      "Foundation charter is private — not publicly registered",
      "Flexible governance structure",
    ],
    notes: "The international foundation is suitable for philanthropic purposes, family governance, and clients who prefer a foundation structure over a common law trust.",
  },

  international_bank: {
    entity_type: "international_bank",
    entity_type_label: "International Banking Licence",
    governing_legislation: "International Banking Act 2005",
    regulator: "SIFA",
    minimum_shareholders: 1,
    minimum_directors: 2,
    minimum_paid_up_capital_usd: 1_000_000,
    nationality_restrictions: "None on shareholders. Directors must have demonstrated financial services experience.",
    registered_agent_required: true,
    registered_office_samoa_required: true,
    annual_return_required: true,
    annual_audit_required: true,
    ubo_disclosure_threshold_pct: 25,
    ubo_disclosure_to: "SIFA and Financial Intelligence Unit (FIU) Samoa",
    ubo_disclosure_public: false,
    tax_treatment: "Licensed under International Banking Act — tax treatment depends on activities and treaty position. Specialist advice required.",
    formation_timeline_typical: "3–6 months (SIFA due diligence and fit-and-proper assessment)",
    annual_fee_usd_approx: 5000,
    formation_fee_usd_approx: 15000,
    key_restrictions: [
      "USD 1,000,000 minimum paid-up capital — must be demonstrated before licence issued",
      "Minimum 2 directors with financial services experience — SIFA fit-and-proper assessment",
      "Mandatory AML/CFT programme under MLPA 2007 and FATF standards",
      "Annual independent audit required",
      "Cannot conduct retail banking in Samoa without separate domestic licence",
      "CBS (Central Bank of Samoa) consultation required for any USDC/digital asset banking activities",
    ],
    key_benefits: [
      "Full international banking licence — can accept deposits, extend credit, conduct FX",
      "Can passport within Pacific treaty partners",
      "SIFA regulatory oversight — internationally recognised since 2026 EU whitelisting",
    ],
    notes:
      "The international banking licence is a significant regulatory undertaking. SIFA conducts a thorough fit-and-proper assessment of all directors and beneficial owners. Allow 3–6 months minimum for licensing.",
  },

  insurance: {
    entity_type: "insurance",
    entity_type_label: "International Insurance Licence",
    governing_legislation: "International Insurance Act 1988",
    regulator: "SIFA",
    minimum_shareholders: 1,
    minimum_directors: 2,
    minimum_paid_up_capital_usd: 250_000,
    nationality_restrictions: "None",
    registered_agent_required: true,
    registered_office_samoa_required: true,
    annual_return_required: true,
    annual_audit_required: true,
    ubo_disclosure_threshold_pct: 25,
    ubo_disclosure_to: "SIFA and Financial Intelligence Unit (FIU) Samoa",
    ubo_disclosure_public: false,
    tax_treatment: "Exempt from Samoa tax on international insurance activities",
    formation_timeline_typical: "1–3 months",
    annual_fee_usd_approx: 3000,
    formation_fee_usd_approx: 8000,
    key_restrictions: [
      "USD 250,000 minimum paid-up capital",
      "Cannot insure Samoa-resident risks without separate domestic licence",
      "Annual actuarial review recommended",
    ],
    key_benefits: [
      "Low capital threshold for captive insurance",
      "Suitable for international marine insurance given Pacific context",
    ],
    notes: "Suitable for captive insurance arrangements and international marine/trade insurance.",
  },

  partnership: {
    entity_type: "partnership",
    entity_type_label: "International Partnership",
    governing_legislation: "International Partnership and Joint Venture Act 1995",
    regulator: "SIFA",
    minimum_shareholders: null,
    minimum_directors: null,
    minimum_paid_up_capital_usd: null,
    nationality_restrictions: "Partners must be non-resident",
    registered_agent_required: true,
    registered_office_samoa_required: true,
    annual_return_required: true,
    annual_audit_required: false,
    ubo_disclosure_threshold_pct: 25,
    ubo_disclosure_to: "Financial Intelligence Unit (FIU) Samoa",
    ubo_disclosure_public: false,
    tax_treatment: "Pass-through taxation — taxed at partner level, not at partnership level in Samoa",
    formation_timeline_typical: "2–3 business days",
    annual_fee_usd_approx: 400,
    formation_fee_usd_approx: 600,
    key_restrictions: [
      "All partners must be non-resident of Samoa",
      "Partnership deed must clearly delineate profit-sharing arrangements",
    ],
    key_benefits: [
      "Flexible profit-sharing",
      "Pass-through tax treatment",
      "Simple governance — no board requirements",
    ],
    notes: "Used for international joint ventures and fund structuring where pass-through tax treatment is required.",
  },

  mutual_fund: {
    entity_type: "mutual_fund",
    entity_type_label: "International Mutual Fund",
    governing_legislation: "International Mutual Funds Act 2009",
    regulator: "SIFA",
    minimum_shareholders: null,
    minimum_directors: null,
    minimum_paid_up_capital_usd: null,
    nationality_restrictions: "Promoter must engage a SIFA-licensed administrator",
    registered_agent_required: true,
    registered_office_samoa_required: true,
    annual_return_required: true,
    annual_audit_required: true,
    ubo_disclosure_threshold_pct: 10,
    ubo_disclosure_to: "SIFA and Financial Intelligence Unit (FIU) Samoa",
    ubo_disclosure_public: false,
    tax_treatment: "Exempt from Samoa tax on fund income and capital gains",
    formation_timeline_typical: "1–2 months",
    annual_fee_usd_approx: 2500,
    formation_fee_usd_approx: 5000,
    key_restrictions: [
      "Must appoint a SIFA-licensed fund administrator",
      "Annual audit required",
      "Lower UBO threshold: 10% for fund investors",
      "Cannot market to Samoa residents",
    ],
    key_benefits: [
      "Tax-exempt on fund income and gains",
      "Suitable for Pacific-focused investment funds",
    ],
    notes: "Mutual funds have additional investor protection requirements compared to IBCs. Fund administrator must be SIFA-licensed.",
  },
};

// ─── Service providers ──────────────────────────────────────────────────────

export interface SifaTrusteeCompany {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  specialisations: string[];
  notes: string;
}

// Register verified 2026-10-15 via samoaibfc.ws — sifa.ws itself blocks
// automated access (403 on every path tried this session), so this list
// is sourced from the recognized mirror, not the SIFA primary site
// directly. See REGISTER_AS_OF / REGISTER_SOURCE below and
// ServiceProvidersResult.register_source in the response. Addresses/
// phone/website retained from the prior (9-company) verification pass
// where the company also appears there; entries without a prior record
// (Sertus Incorporations) carry only what the register itself lists.
//
// Listed in the register's own source order (not alphabetised, not
// re-ordered by SBP) — every entry, including Pacific Fiduciaries
// (Samoa) Limited, is a neutral, equally-listed SIFA-licensed trustee
// company. No entry receives special placement, commentary, or
// disclosure treatment different from any other.
export const REGISTER_AS_OF = "2026-10-15";
export const REGISTER_SOURCE = "samoaibfc.ws (mirror — sifa.ws blocks automated access)";

export const SIFA_TRUSTEE_COMPANIES: SifaTrusteeCompany[] = [
  {
    name: "Asiaciti Trust Samoa Limited",
    address: "Saleufi, Apia",
    phone: null,
    website: "https://www.asiaciti.com",
    specialisations: ["IBC formation", "Trust administration", "International foundations", "Wealth planning"],
    notes: "Part of the Asiaciti Trust group, an established Pacific and Asian trust company.",
  },
  {
    name: "Gold-In (Samoa) Co. Limited",
    address: "Vaea Street, Apia",
    phone: null,
    website: null,
    specialisations: ["IBC formation", "Registered agent services"],
    notes: "SIFA-licensed provider offering registered agent and formation services.",
  },
  {
    name: "Intershore Consult (Samoa) Limited",
    address: "Le Sanalele Complex, Vaea Street, Apia",
    phone: null,
    website: null,
    specialisations: ["IBC formation", "Registered agent services", "Corporate secretarial"],
    notes: "Located in Le Sanalele Complex alongside several other licensed providers.",
  },
  {
    name: "Intetrust Limited",
    address: "Vaea Street, Apia",
    phone: null,
    website: null,
    specialisations: ["IBC formation", "Trust administration"],
    notes: "SIFA-licensed trustee company operating from central Apia.",
  },
  {
    name: "Maystar (Samoa) Limited",
    address: "Maystar Chambers, Apia",
    phone: null,
    website: null,
    specialisations: ["IBC formation", "Trust administration", "Registered agent services"],
    notes: "Locally focused Apia-based provider.",
  },
  {
    name: "Acclime (Samoa) Limited",
    address: "Saleufi, Apia",
    phone: null,
    website: "https://www.acclime.com",
    specialisations: ["IBC formation", "Accounting and tax advisory", "Corporate secretarial"],
    notes: "Part of the Acclime Group with a presence across Asia-Pacific.",
  },
  {
    name: "Pacific Fiduciaries (Samoa) Limited",
    address: "Le Sanalele Complex, Vaea Street, Apia",
    phone: "+685 29067",
    website: null,
    specialisations: ["IBC formation", "Trust administration", "Registered agent services"],
    notes: "Long-established Apia-based SIFA-licensed trustee company. Locally managed.",
  },
  {
    name: "Portcullis (Samoa) Ltd",
    address: "Taufusi, Apia",
    phone: null,
    website: "https://www.portcullis.co",
    specialisations: ["IBC formation", "Trust administration", "Fund administration", "Corporate services"],
    notes: "Part of the Portcullis Group, with offices across Southeast Asia and the Pacific.",
  },
  {
    name: "Sertus Incorporations (Samoa) Limited",
    address: null,
    phone: null,
    website: null,
    specialisations: ["IBC formation", "Registered agent services"],
    notes: "Listed on the SIFA trustee company register as of the 2026-10-15 verification pass. Address/phone/website not yet independently confirmed — verify directly with the company before engaging.",
  },
  {
    name: "Vistra (Samoa) Limited",
    address: "Beach Road, Apia",
    phone: null,
    website: "https://www.vistra.com",
    specialisations: ["IBC formation", "Trust administration", "Fund administration", "Compliance"],
    notes: "Global corporate services provider — Vistra Group operates in 45+ jurisdictions.",
  },
];

// ─── Compliance status ──────────────────────────────────────────────────────

export interface SamoaComplianceStatus {
  jurisdiction: "Samoa (Independent State of)";
  iso_code: "WS";
  as_of: string;
  eu_blacklist: {
    status: "not_listed";
    removed_from_list_date: "2026-02-17";
    reform_cited: string;
    legislative_reforms_cited: string[];
    source_url: string;
  };
  fatf_status: {
    status: "compliant";
    last_mutual_evaluation: string;
    fur_url: string;
    notes: string;
  };
  oecd_peer_review: {
    status: "pending_verification";
    note: string;
    source_url: string;
    data_verified_date: string | null;
  };
  tiea_network: {
    count_approximate: number;
    key_partners: string[];
    notes: string;
  };
  aml_cft_framework: {
    primary_legislation: string;
    fiu_name: string;
    fatf_member: boolean;
    apc_member: boolean;
  };
  sifa_regulatory_status: {
    active_since: string;
    licensed_trustee_companies: number;
    international_companies_registered_approx: number;
    notes: string;
  };
  due_diligence_signal: "low_risk" | "medium_risk" | "high_risk";
  due_diligence_notes: string;
}

const COMPLIANCE_STATUS: SamoaComplianceStatus = {
  jurisdiction: "Samoa (Independent State of)",
  iso_code: "WS",
  as_of: "2026-10",
  eu_blacklist: {
    status: "not_listed",
    removed_from_list_date: "2026-02-17",
    reform_cited: "Abolition of harmful offshore business regime, January 2026",
    legislative_reforms_cited: [
      "Abolition of harmful offshore business regime, January 2026",
      "Strengthened beneficial ownership registry requirements",
      "Enhanced AML/CFT enforcement framework",
      "MLPA 2007 amendments bringing enforcement into FATF alignment",
      "Improved SIFA supervisory capacity",
    ],
    source_url: "https://finance.ec.europa.eu/financial-crime/eu-list-non-cooperative-jurisdictions-tax-purposes_en",
  },
  fatf_status: {
    status: "compliant",
    last_mutual_evaluation: "2023",
    fur_url: "https://www.fatf-gafi.org/en/publications/Mutualevaluations/Samoa-FUR-2023.html",
    notes: "Member of Asia/Pacific Group on Money Laundering (APG), the FATF-style regional body for the Pacific. Most recent APG Follow-Up Report published 2023. Not currently on FATF grey or black list.",
  },
  oecd_peer_review: {
    status: "pending_verification",
    note: "2019 Second Round report confirmed to exist. Overall rating being verified against official OECD source before endpoint goes live — oecd.org blocks automated access, so this field is not yet independently confirmed. Do not treat as a confirmed rating until data_verified_date is set.",
    source_url: "https://www.oecd.org/content/dam/oecd/en/publications/reports/2019/11/global-forum-on-transparency-and-exchange-of-information-for-tax-purposes-samoa-2019-second-round_bc3b06e4/d8954bf5-en.pdf",
    data_verified_date: null,
  },
  tiea_network: {
    count_approximate: 15,
    key_partners: ["Australia", "New Zealand", "United States", "France", "Netherlands", "United Kingdom"],
    notes: "Samoa has signed Tax Information Exchange Agreements (TIEAs) with major OECD partners and participates in the Multilateral Convention on Mutual Administrative Assistance in Tax Matters.",
  },
  aml_cft_framework: {
    primary_legislation: "Money Laundering Prevention Act 2007 (MLPA 2007) and amendments",
    fiu_name: "Financial Intelligence Unit (FIU) Samoa — under Ministry of Finance",
    fatf_member: false,
    apc_member: true,
  },
  sifa_regulatory_status: {
    active_since: "2005",
    licensed_trustee_companies: 10,
    international_companies_registered_approx: 20000,
    notes: "SIFA was established by the Samoa International Finance Authority Act 2005, replacing the earlier International Finance Act. Approximately 20,000 IBCs are registered. EU whitelisting in February 2026 followed significant AML/CFT reforms.",
  },
  due_diligence_signal: "low_risk",
  due_diligence_notes:
    "Post-EU-whitelisting (February 2026), Samoa presents a low-risk regulatory profile for standard IBC, trust, and international finance structures. Full KYC/AML documentation is still required — SIFA-licensed registered agents will request certified identification for all directors and UBOs with ≥25% interest. Source of funds documentation is expected for all formation mandates.",
};

// ─── Banking setup ──────────────────────────────────────────────────────────

export interface SamoaBankingSetup {
  licence_type: "International Banking Licence";
  governing_legislation: "International Banking Act 2005";
  regulator: "SIFA";
  minimum_paid_up_capital_usd: 1_000_000;
  minimum_directors: 2;
  director_requirements: string[];
  aml_cft_requirements: string[];
  application_process: {
    steps: Array<{ step: number; description: string; timeline: string }>;
    total_timeline_estimate: string;
  };
  annual_obligations: string[];
  activities_permitted: string[];
  activities_not_permitted_without_additional_licence: string[];
  fees: {
    application_fee_usd_approx: number;
    annual_licence_fee_usd_approx: number;
  };
  cbs_consultation_note: string;
  cbdc_digital_asset_note: string;
}

const BANKING_SETUP: SamoaBankingSetup = {
  licence_type: "International Banking Licence",
  governing_legislation: "International Banking Act 2005",
  regulator: "SIFA",
  minimum_paid_up_capital_usd: 1_000_000,
  minimum_directors: 2,
  director_requirements: [
    "Minimum 2 directors — both must demonstrate relevant financial services experience",
    "SIFA fit-and-proper assessment for all directors and major shareholders",
    "Criminal background checks for all directors and UBOs with ≥25% interest",
    "References from prior financial services employers or regulators required",
    "Residency in Samoa not required but at least one director must be accessible to SIFA",
  ],
  aml_cft_requirements: [
    "Comprehensive AML/CFT Programme required — MLPA 2007 compliant",
    "Customer Due Diligence (CDD) and Enhanced Due Diligence (EDD) procedures documented",
    "Suspicious Transaction Reporting (STR) procedures to FIU Samoa",
    "Staff AML/CFT training programme mandatory",
    "Independent AML/CFT audit annually",
    "Transaction monitoring system — FATF standards",
    "Correspondent banking relationships must include de-risking assessment",
  ],
  application_process: {
    steps: [
      { step: 1, description: "Engage SIFA-licensed registered agent — required before application", timeline: "1 week" },
      { step: 2, description: "Prepare business plan, ownership structure, compliance manual, director CVs and references", timeline: "4–8 weeks" },
      { step: 3, description: "Submit application to SIFA with all supporting documentation", timeline: "1 week" },
      { step: 4, description: "SIFA fit-and-proper assessment of all directors and major shareholders", timeline: "4–8 weeks" },
      { step: 5, description: "SIFA may request additional information or an in-person meeting", timeline: "2–4 weeks" },
      { step: 6, description: "SIFA issues Approval in Principle (AIP)", timeline: "2–4 weeks after assessment" },
      { step: 7, description: "Demonstrate paid-up capital of USD 1,000,000 — proof of deposit required", timeline: "2 weeks" },
      { step: 8, description: "SIFA issues International Banking Licence", timeline: "1 week after capital demonstrated" },
    ],
    total_timeline_estimate: "3–6 months from initial engagement of registered agent",
  },
  annual_obligations: [
    "Annual licence renewal fee to SIFA",
    "Annual independent audit by SIFA-approved auditor",
    "Annual AML/CFT programme review and certification",
    "Annual return to SIFA including audited financial statements",
    "Ongoing suspicious transaction reporting to FIU Samoa",
    "Capital adequacy — maintain minimum USD 1,000,000 paid-up capital at all times",
    "Notifiable events — any change of director, major shareholder, or ownership structure requires SIFA notification",
  ],
  activities_permitted: [
    "Accept deposits from non-Samoa residents",
    "Extend credit to non-Samoa resident borrowers",
    "Foreign exchange transactions for international clients",
    "Trade finance and letters of credit",
    "International wire transfers",
    "Correspondent banking relationships (subject to de-risking assessment)",
  ],
  activities_not_permitted_without_additional_licence: [
    "Retail banking to Samoa residents — requires separate Central Bank of Samoa (CBS) domestic banking licence",
    "Issuing or redeeming USDC or other digital assets — requires CBS consultation and specific regulatory approval",
    "Acting as a payment service provider to Samoa domestic market — requires CBS payment institution licence",
    "Insurance activities — requires separate International Insurance Licence from SIFA",
  ],
  fees: {
    application_fee_usd_approx: 5000,
    annual_licence_fee_usd_approx: 5000,
  },
  cbs_consultation_note:
    "Any international banking activities that touch the Samoa domestic financial system — including USDC settlement, digital asset issuance, or domestic payment services — require consultation with the Central Bank of Samoa (CBS) before commencement. A SIFA international banking licence does NOT automatically authorise CBS-regulated activities.",
  cbdc_digital_asset_note:
    "USDC and other digital asset activities via an international banking licence are a novel area. CBS has not issued a written position on USDC settlement within the Samoa financial system as of October 2026. International banking licensees wishing to accept or facilitate USDC must obtain CBS's written position before launch.",
};

// ─── Exported service functions ─────────────────────────────────────────────

export interface EntitySetupResult {
  query: { entity_type: SamoaEntityType | "all" };
  results: EntityRequirements[];
  aml_cfct_mandatory_notice: string;
  next_step_notice: string;
  official_documents: typeof SIFA_OFFICIAL_DOCUMENTS;
  platform_context: typeof PDC_PLATFORM_CONTEXT;
  fetched_at: string;
  attribution: typeof SIFA_SOURCE_ATTRIBUTION;
}

export function getEntitySetup(entityType: SamoaEntityType | "all"): EntitySetupResult {
  const results =
    entityType === "all"
      ? Object.values(ENTITY_REQUIREMENTS)
      : [ENTITY_REQUIREMENTS[entityType]];

  return {
    query: { entity_type: entityType },
    results,
    aml_cfct_mandatory_notice:
      "MANDATORY: All entity types require UBO disclosure of any beneficial owner with ≥25% interest to the Financial Intelligence Unit (FIU) Samoa. AML/CFT programme documentation is required at formation under MLPA 2007. Source of funds documentation will be requested by your registered agent.",
    next_step_notice:
      "To proceed with formation, engage one of the 10 SIFA-licensed registered agents in Samoa. They are the sole authorised route for international company formation — direct filing with SIFA is not available. PDC can provide the service provider directory via /pacific/samoa-service-providers.",
    official_documents: SIFA_OFFICIAL_DOCUMENTS,
    platform_context: PDC_PLATFORM_CONTEXT,
    fetched_at: new Date().toISOString(),
    attribution: SIFA_SOURCE_ATTRIBUTION,
  };
}

export interface ServiceProvidersResult {
  jurisdiction: "Samoa";
  regulator: "SIFA";
  total_licensed_trustee_companies: number;
  register_as_of: string;
  register_source: string;
  providers: SifaTrusteeCompany[];
  important_notice: string;
  law_firms_note: string;
  official_documents: typeof SIFA_OFFICIAL_DOCUMENTS;
  platform_context: typeof PDC_PLATFORM_CONTEXT;
  fetched_at: string;
  attribution: typeof SIFA_SOURCE_ATTRIBUTION;
}

export function getServiceProviders(): ServiceProvidersResult {
  return {
    jurisdiction: "Samoa",
    regulator: "SIFA",
    total_licensed_trustee_companies: SIFA_TRUSTEE_COMPANIES.length,
    register_as_of: REGISTER_AS_OF,
    register_source: REGISTER_SOURCE,
    providers: SIFA_TRUSTEE_COMPANIES,
    important_notice:
      "This directory lists all known SIFA-licensed trustee companies as of the register_as_of date above. You must use one of these licensed companies as your registered agent — non-licensed introducers or agents cannot legally register a Samoa IBC, trust, or foundation. sifa.ws itself blocks automated verification (see register_source) — always verify current licence status directly with SIFA before engaging any provider.",
    law_firms_note:
      "Samoa has several commercial law firms with SIFA-related practice experience, including those listed with the Samoa Law Society. PDC's law firm directory is in development pending verification against the Samoa Law Society registry. Contact details for the Samoa Law Society: lawsociety.ws",
    official_documents: SIFA_OFFICIAL_DOCUMENTS,
    platform_context: PDC_PLATFORM_CONTEXT,
    fetched_at: new Date().toISOString(),
    attribution: SIFA_SOURCE_ATTRIBUTION,
  };
}

export interface ComplianceStatusResult {
  compliance_status: SamoaComplianceStatus;
  summary: string;
  official_documents: typeof SIFA_OFFICIAL_DOCUMENTS;
  platform_context: typeof PDC_PLATFORM_CONTEXT;
  fetched_at: string;
  attribution: typeof SIFA_SOURCE_ATTRIBUTION;
}

export function getComplianceStatus(): ComplianceStatusResult {
  return {
    compliance_status: COMPLIANCE_STATUS,
    summary:
      "Samoa (WS) presents a LOW RISK regulatory profile as of October 2026. Removed from the EU non-cooperative jurisdictions blacklist on 17 February 2026 (citing abolition of the harmful offshore business regime). Not on FATF grey or black list; most recent APG Follow-Up Report published 2023. OECD Global Forum peer review rating is PENDING VERIFICATION against the official OECD source — see oecd_peer_review. Full KYC/AML documentation is still required for all formations.",
    official_documents: SIFA_OFFICIAL_DOCUMENTS,
    platform_context: PDC_PLATFORM_CONTEXT,
    fetched_at: new Date().toISOString(),
    attribution: SIFA_SOURCE_ATTRIBUTION,
  };
}

export interface BankingSetupResult {
  banking_setup: SamoaBankingSetup;
  executive_summary: string;
  official_documents: typeof SIFA_OFFICIAL_DOCUMENTS;
  platform_context: typeof PDC_PLATFORM_CONTEXT;
  fetched_at: string;
  attribution: typeof SIFA_SOURCE_ATTRIBUTION;
}

export function getBankingSetup(): BankingSetupResult {
  return {
    banking_setup: BANKING_SETUP,
    executive_summary:
      "An International Banking Licence from SIFA requires USD 1,000,000 minimum paid-up capital, 2 qualified directors, a full MLPA 2007-compliant AML/CFT programme, and SIFA fit-and-proper assessment of all directors and major shareholders. Typical timeline: 3–6 months. Any USDC or digital asset activities require separate CBS consultation.",
    official_documents: SIFA_OFFICIAL_DOCUMENTS,
    platform_context: PDC_PLATFORM_CONTEXT,
    fetched_at: new Date().toISOString(),
    attribution: SIFA_SOURCE_ATTRIBUTION,
  };
}

const VALID_ENTITY_TYPES: SamoaEntityType[] = ["ibc", "trust", "foundation", "international_bank", "insurance", "partnership", "mutual_fund"];

export function parseEntityType(raw: string | undefined): SamoaEntityType | "all" {
  if (!raw || raw === "all") return "all";
  if ((VALID_ENTITY_TYPES as string[]).includes(raw)) return raw as SamoaEntityType;
  throw new Error(
    `Invalid entity_type '${raw}'. Valid values: all, ${VALID_ENTITY_TYPES.join(", ")}`
  );
}
