/**
 * Pacific Investment Intelligence Service
 *
 * Pre-structured regulatory data for 6 Pacific Island nations.
 * Sources:
 *   - Samoa: MCIL Business Brochure 2025, MCIL National Investment Policy Statement 2025
 *   - Fiji: Investment Fiji FAQs (investmentfiji.org.fj), Companies Act
 *   - Vanuatu: VFIPA eBusiness Link portal documentation (investvanuatu.vu)
 *   - PNG: IPA Quick-Start Guide (ipa.gov.pg)
 *   - Tonga: Business Registries (businessregistries.gov.to) incorporation guide
 *   - Solomon Islands: COMMERCE.GOV.SB Foreign Investment Division (partial — fees unavailable online)
 *
 * Data currency: October 2026 — sourced from official government/investment promotion
 * agency publications. SBP has NOT independently certified this data.
 * Verify current figures with the relevant national authority before acting.
 *
 * Decision 59: PDC first-party synthesis layer. P1 / P10 do not apply —
 * SBP is the publisher of its own aggregation of public-domain government sources.
 *
 * Pricing: $0.30–$0.50 USDC per query (synthesis/intelligence tier, not raw open-data).
 * Decision 60 $0.01 cap applies only to raw wrappers of no-auth free APIs.
 * Decision 23 Bronze cap: max $0.50/query for Bronze-tier provider.
 */

export const SOURCE_ATTRIBUTION = {
  publisher: "Pacific Data Commons — Synergy Blockchain Pacific",
  sources: [
    "Samoa MCIL Business Setup Brochure 2025",
    "Samoa MCIL National Investment Policy Statement 2025",
    "Investment Fiji FAQ (investmentfiji.org.fj, Oct 2026)",
    "VFIPA eBusiness Link (investvanuatu.vu, Oct 2026)",
    "IPA PNG Quick-Start Guide (ipa.gov.pg, Oct 2026)",
    "Tonga Business Registries (businessregistries.gov.to, Oct 2026)",
    "Solomon Islands Commerce.gov.sb (partial, Oct 2026)",
  ],
  data_currency: "October 2026",
  disclaimer:
    "SBP has NOT independently certified this data. Figures reflect official sources at collection date. Verify with the relevant national authority before making investment decisions.",
  x402_path: "/invest/*",
};

// ─── Core nation data ────────────────────────────────────────────────────────

export type NationCode = "ws" | "fj" | "vu" | "pg" | "to" | "sb";

export interface TaxProfile {
  corporate_tax_pct: number | null;
  corporate_tax_note?: string;
  vat_gst_pct: number | null;
  vat_gst_name: string;
  withholding_tax_nonresident_pct: number | null;
  income_tax_top_rate_pct: number | null;
  income_tax_nontaxable_threshold: string | null;
  double_tax_agreements: string[];
  payroll_levy_employer_pct: number | null;
  payroll_levy_employee_pct: number | null;
  payroll_fund_name: string | null;
}

export interface SetupCost {
  currency: string;
  company_registration: number | null;
  company_registration_note?: string;
  sole_trader_registration: number | null;
  partnership_registration: number | null;
  foreign_investment_certificate: number | null;
  fic_annual_renewal: number | null;
  annual_return: number | null;
  other_fees: { label: string; amount: number | string }[];
}

export interface SetupTimeline {
  company_registration_days: string;
  foreign_investment_approval_days: string;
  overall_estimated_weeks: string;
  notes: string;
}

export interface ForeignOwnershipRules {
  max_foreign_equity_general_pct: number | null;
  fully_foreign_allowed: boolean;
  resident_director_required: boolean;
  local_partner_required: boolean;
  min_investment_threshold: string | null;
  min_investment_currency: string | null;
  certificate_required: string | null;
}

export interface LandTenure {
  customary_pct: number | null;
  government_pct: number | null;
  freehold_pct: number | null;
  foreign_freehold_allowed: boolean;
  foreign_freehold_notes: string;
  lease_typical_term_years: string | null;
  land_board: string | null;
}

export interface SectorRestriction {
  sector: string;
  status: "reserved_citizens_only" | "restricted_jv_required" | "restricted_equity_cap" | "open" | "requires_approval";
  foreign_equity_cap_pct?: number;
  notes: string;
}

export interface NationProfile {
  code: NationCode;
  name: string;
  currency: string;
  currency_code: string;
  primary_investment_body: string;
  investment_body_url: string;
  business_registry_url: string;
  tax: TaxProfile;
  setup_cost: SetupCost;
  setup_timeline: SetupTimeline;
  foreign_ownership: ForeignOwnershipRules;
  land: LandTenure;
  sector_restrictions: SectorRestriction[];
  setup_steps: string[];
  data_gaps: string[];
}

// ─── Nation data ─────────────────────────────────────────────────────────────

const SAMOA: NationProfile = {
  code: "ws",
  name: "Samoa",
  currency: "Samoan Tālā",
  currency_code: "WST",
  primary_investment_body: "Ministry of Commerce, Industry and Labour (MCIL)",
  investment_body_url: "https://www.mcil.gov.ws",
  business_registry_url: "https://www.mcil.gov.ws",
  tax: {
    corporate_tax_pct: 27,
    vat_gst_pct: 15,
    vat_gst_name: "VAGST (Value Added Goods and Services Tax)",
    withholding_tax_nonresident_pct: 15,
    income_tax_top_rate_pct: 27,
    income_tax_nontaxable_threshold: "SAT$15,000 per annum",
    double_tax_agreements: ["Australia", "New Zealand", "Japan", "South Africa", "South Korea"],
    payroll_levy_employer_pct: 10,
    payroll_levy_employee_pct: 10,
    payroll_fund_name: "Samoa National Provident Fund (SNPF)",
  },
  setup_cost: {
    currency: "WST",
    company_registration: 250,
    company_registration_note: "Company registration fee at MCIL",
    sole_trader_registration: 282,
    partnership_registration: 282,
    foreign_investment_certificate: 100,
    fic_annual_renewal: 50,
    annual_return: 50,
    other_fees: [
      { label: "FIC Lodgment fee", amount: 50 },
      { label: "FIC Issuance fee", amount: 50 },
      { label: "FIC Amendment fee", amount: 70 },
      { label: "Building permit (varies, requires 13 documents)", amount: "Contact MCIL" },
    ],
  },
  setup_timeline: {
    company_registration_days: "1–5 business days",
    foreign_investment_approval_days: "10–20 business days",
    overall_estimated_weeks: "3–6 weeks",
    notes:
      "Environmental Impact Assessment (EIA) required for applicable projects. Building permits require 13 supporting documents. ACC levy 1% (employer + employee).",
  },
  foreign_ownership: {
    max_foreign_equity_general_pct: 100,
    fully_foreign_allowed: true,
    resident_director_required: false,
    local_partner_required: false,
    min_investment_threshold: null,
    min_investment_currency: null,
    certificate_required: "Foreign Investment Certificate (FIC) from MCIL",
  },
  land: {
    customary_pct: 81,
    government_pct: 15,
    freehold_pct: 4,
    foreign_freehold_allowed: false,
    foreign_freehold_notes:
      "~81% of land is customary — foreigners may lease only (20–30 year terms via Ministry of Lands). Freehold (~4%) cannot be acquired by foreign nationals. Government land (~15%) available for lease.",
    lease_typical_term_years: "20–30",
    land_board: "Ministry of Natural Resources and Environment (Lands Division)",
  },
  sector_restrictions: [
    {
      sector: "Bus/taxi transport",
      status: "reserved_citizens_only",
      notes: "Reserved for Samoan citizens only",
    },
    {
      sector: "Rental vehicles",
      status: "reserved_citizens_only",
      notes: "Reserved for Samoan citizens only",
    },
    {
      sector: "Retailing",
      status: "reserved_citizens_only",
      notes: "Reserved for Samoan citizens only",
    },
    {
      sector: "Sawmilling",
      status: "reserved_citizens_only",
      notes: "Reserved for Samoan citizens only",
    },
    {
      sector: "Traditional elei garment production",
      status: "reserved_citizens_only",
      notes: "Reserved for Samoan citizens only",
    },
    {
      sector: "Commercial fishing",
      status: "restricted_equity_cap",
      foreign_equity_cap_pct: 40,
      notes: "Maximum 40% foreign equity",
    },
    {
      sector: "Noni juice / virgin coconut oil processing",
      status: "restricted_jv_required",
      notes: "Joint venture with Samoan partner required",
    },
    {
      sector: "Architectural services",
      status: "restricted_jv_required",
      notes: "Joint venture with Samoan firm required",
    },
    {
      sector: "Engineering and construction",
      status: "requires_approval",
      notes: "Foreign firm must incorporate in Samoa",
    },
    {
      sector: "Tourism / hospitality",
      status: "open",
      notes: "Open to 100% foreign ownership subject to FIC",
    },
    {
      sector: "Manufacturing",
      status: "open",
      notes: "Open to 100% foreign ownership subject to FIC",
    },
  ],
  setup_steps: [
    "Reserve company name at MCIL",
    "Register company (SAT$250) — Form 1 to 5 equivalent",
    "Apply for Foreign Investment Certificate (FIC) — SAT$50 lodgment + SAT$50 issuance",
    "Register for VAGST with Samoa Revenue Authority",
    "Register for SNPF (employee/employer 10%+10%)",
    "Register for ACC levy (1%+1%)",
    "Obtain business licence (sector-specific)",
    "Apply for building permit if applicable (requires 13 documents + potential EIA)",
    "Open business bank account",
  ],
  data_gaps: ["Exact building permit fee schedule", "Sector-specific licence fees"],
};

const FIJI: NationProfile = {
  code: "fj",
  name: "Fiji",
  currency: "Fijian Dollar",
  currency_code: "FJD",
  primary_investment_body: "Investment Fiji",
  investment_body_url: "https://investmentfiji.org.fj",
  business_registry_url: "https://www.companies.gov.fj",
  tax: {
    corporate_tax_pct: 25,
    corporate_tax_note: "15% for companies listed on South Pacific Stock Exchange (SPSE)",
    vat_gst_pct: 15,
    vat_gst_name: "VAT",
    withholding_tax_nonresident_pct: null,
    income_tax_top_rate_pct: null,
    income_tax_nontaxable_threshold: null,
    double_tax_agreements: ["Australia", "New Zealand", "Japan", "United Kingdom", "Malaysia", "UAE", "South Korea", "India"],
    payroll_levy_employer_pct: null,
    payroll_levy_employee_pct: null,
    payroll_fund_name: "Fiji National Provident Fund (FNPF)",
  },
  setup_cost: {
    currency: "FJD",
    company_registration: null,
    sole_trader_registration: null,
    partnership_registration: null,
    foreign_investment_certificate: null,
    fic_annual_renewal: null,
    annual_return: null,
    other_fees: [
      { label: "Minimum initial capital to remit", amount: 300000 },
      { label: "Minimum wage (from Jan 2025)", amount: "FJD$5.00/hr" },
    ],
  },
  setup_timeline: {
    company_registration_days: "2–5 business days (online via Registrar of Companies)",
    foreign_investment_approval_days: "Within 3 months of incorporation (capital remittance deadline)",
    overall_estimated_weeks: "4–8 weeks (with bank account and immigration)",
    notes:
      "Resident director required. Foreign nationals must obtain investor/work permit from Immigration. Bank account opened through ROC → FRCS → Reserve Bank of Fiji sequence.",
  },
  foreign_ownership: {
    max_foreign_equity_general_pct: 100,
    fully_foreign_allowed: true,
    resident_director_required: true,
    local_partner_required: false,
    min_investment_threshold: "300,000",
    min_investment_currency: "FJD",
    certificate_required: "Registration with Registrar of Companies + Investment Fiji registration for incentives",
  },
  land: {
    customary_pct: 91,
    government_pct: 4,
    freehold_pct: 5,
    foreign_freehold_allowed: true,
    foreign_freehold_notes:
      "~91% iTaukei (native) land — leased only via iTaukei Land Trust Board (TLTB). Foreign nationals CANNOT buy freehold land inside town/city boundaries for residential purposes. Freehold purchases over 1 acre require Ministerial approval.",
    lease_typical_term_years: "30–99 (TLTB agricultural/commercial leases)",
    land_board: "iTaukei Land Trust Board (TLTB)",
  },
  sector_restrictions: [
    {
      sector: "Small retail (below FJD$300K threshold)",
      status: "restricted_equity_cap",
      notes: "Restricted activities list under 2022 Investment Regulation — higher thresholds apply",
    },
    {
      sector: "Tourism / hospitality",
      status: "open",
      notes: "Open sector — major FDI driver. FJD$300K minimum investment applies.",
    },
    {
      sector: "Manufacturing",
      status: "open",
      notes: "Open to 100% foreign ownership",
    },
    {
      sector: "Financial services",
      status: "requires_approval",
      notes: "Reserve Bank of Fiji approval required",
    },
    {
      sector: "Agriculture",
      status: "open",
      notes: "Open — land lease constraints apply via TLTB",
    },
  ],
  setup_steps: [
    "Reserve company name — Registrar of Companies (online)",
    "Incorporate company — Registrar of Companies",
    "Register with Fiji Revenue and Customs Service (FRCS) for VAT and tax",
    "Open business bank account — Reserve Bank of Fiji process",
    "Apply for investor/work permits via Immigration Fiji",
    "Register with Investment Fiji (for investment incentives and approvals)",
    "Remit minimum FJD$300,000 initial capital within 3 months",
    "Register with FNPF (Fiji National Provident Fund)",
    "Obtain sector-specific licences/permits",
  ],
  data_gaps: ["Company registration fee schedule (exact FJD amounts)", "FNPF contribution rates", "Withholding tax rates"],
};

const VANUATU: NationProfile = {
  code: "vu",
  name: "Vanuatu",
  currency: "Vanuatu Vatu",
  currency_code: "VUV",
  primary_investment_body: "Vanuatu Foreign Investment Promotion Agency (VFIPA)",
  investment_body_url: "https://investvanuatu.vu",
  business_registry_url: "https://ebusinesslink.vu",
  tax: {
    corporate_tax_pct: 0,
    corporate_tax_note: "Vanuatu has NO corporate income tax — zero-tax jurisdiction",
    vat_gst_pct: 15,
    vat_gst_name: "Value Added Tax (VAT)",
    withholding_tax_nonresident_pct: null,
    income_tax_top_rate_pct: 0,
    income_tax_nontaxable_threshold: "No personal income tax",
    double_tax_agreements: [],
    payroll_levy_employer_pct: null,
    payroll_levy_employee_pct: null,
    payroll_fund_name: "Vanuatu National Provident Fund (VNPF)",
  },
  setup_cost: {
    currency: "VUV",
    company_registration: null,
    company_registration_note: "Fees via eBusiness Link portal — exact schedule not published online (contact VFIPA)",
    sole_trader_registration: null,
    partnership_registration: null,
    foreign_investment_certificate: null,
    fic_annual_renewal: null,
    annual_return: null,
    other_fees: [
      { label: "FIRC (Foreign Investment Registration Certificate) — via eBusiness Link", amount: "Contact VFIPA" },
      { label: "Annual FIRC survey (mandatory)", amount: "Contact VFIPA" },
      { label: "Vanuatu Development Support Programme (VDSP) contribution — applicable for some sectors", amount: "Contact VFIPA" },
    ],
  },
  setup_timeline: {
    company_registration_days: "1–7 working days (FIRC via eBusiness Link portal)",
    foreign_investment_approval_days: "1–7 working days",
    overall_estimated_weeks: "2–4 weeks (with immigration, work permits, VNPF)",
    notes:
      "FIRC is the first and critical step — no other regulatory agencies will process without it. Annual FIRC survey mandatory. Residency visa via evisa.gov.vu. Work permits via Department of Labour.",
  },
  foreign_ownership: {
    max_foreign_equity_general_pct: 100,
    fully_foreign_allowed: true,
    resident_director_required: false,
    local_partner_required: false,
    min_investment_threshold: null,
    min_investment_currency: null,
    certificate_required: "Foreign Investment Registration Certificate (FIRC) from VFIPA — mandatory first step",
  },
  land: {
    customary_pct: 97,
    government_pct: 3,
    freehold_pct: 0,
    foreign_freehold_allowed: false,
    foreign_freehold_notes:
      "ALL land in Vanuatu belongs to indigenous customary owners (Constitution Article 73). Foreigners lease only — typically 75-year leases (renewable). No freehold exists for foreign nationals.",
    lease_typical_term_years: "75 (with renewal option)",
    land_board: "Department of Lands and Survey / Custom Land Tribunals",
  },
  sector_restrictions: [
    {
      sector: "Retail (small-scale, below VUV threshold)",
      status: "reserved_citizens_only",
      notes: "Restricted to ni-Vanuatu citizens — contact VFIPA for current threshold",
    },
    {
      sector: "Market vending",
      status: "reserved_citizens_only",
      notes: "Reserved for ni-Vanuatu",
    },
    {
      sector: "Tourism / hospitality",
      status: "open",
      notes: "Major open sector — offshore banking and tourism are primary FDI categories",
    },
    {
      sector: "Offshore financial services",
      status: "open",
      notes: "Zero-tax jurisdiction — offshore banking, insurance, fund management open",
    },
    {
      sector: "Agriculture / copra",
      status: "open",
      notes: "Open but land lease constraints apply",
    },
  ],
  setup_steps: [
    "Register online via eBusiness Link (ebusinesslink.vu)",
    "Obtain Foreign Investment Registration Certificate (FIRC) — 1–7 working days",
    "Apply for residency visa via evisa.gov.vu (if relocating)",
    "Apply for work permits — Department of Labour and Employment Services",
    "Register with Vanuatu National Provident Fund (VNPF)",
    "Obtain business licence (sector-specific)",
    "Submit annual FIRC survey each year",
    "Apply for FIRC variation if adding activities or investors",
  ],
  data_gaps: ["Exact FIRC fee amounts", "VNPF contribution rates", "Sector-specific licence fees", "VDSP contribution thresholds"],
};

const PNG: NationProfile = {
  code: "pg",
  name: "Papua New Guinea",
  currency: "PNG Kina",
  currency_code: "PGK",
  primary_investment_body: "Investment Promotion Authority (IPA)",
  investment_body_url: "https://www.ipa.gov.pg",
  business_registry_url: "https://www.ipa.gov.pg",
  tax: {
    corporate_tax_pct: 30,
    corporate_tax_note: "30% standard; lower rates apply to listed companies and mining/petroleum",
    vat_gst_pct: 10,
    vat_gst_name: "GST (Goods and Services Tax)",
    withholding_tax_nonresident_pct: 17,
    income_tax_top_rate_pct: 42,
    income_tax_nontaxable_threshold: "K12,500 per annum",
    double_tax_agreements: ["Australia", "Canada", "China", "Fiji", "Germany", "Indonesia", "Japan", "Malaysia", "New Zealand", "Russia", "Singapore", "South Korea", "UK"],
    payroll_levy_employer_pct: null,
    payroll_levy_employee_pct: null,
    payroll_fund_name: "Nasfund (National Superannuation Fund) or Nambawan Super",
  },
  setup_cost: {
    currency: "PGK",
    company_registration: 500,
    company_registration_note: "Forms 1–5 for new local company. Cheque payable to Registrar of Companies.",
    sole_trader_registration: null,
    partnership_registration: null,
    foreign_investment_certificate: 2000,
    fic_annual_renewal: null,
    annual_return: null,
    other_fees: [
      { label: "Overseas company (Form 46) registration", amount: 500 },
      { label: "Foreign enterprise certification — bank cheque payable to IPA", amount: 2000 },
    ],
  },
  setup_timeline: {
    company_registration_days: "24 hours to 3 weeks (from complete application)",
    foreign_investment_approval_days: "5 weeks (certification process)",
    overall_estimated_weeks: "6–10 weeks",
    notes:
      "Two mandatory steps in order: (1) Register company/overseas company first, then (2) obtain Foreign Enterprise Certification. Incomplete forms are rejected causing delays. Documents include police clearance, CVs, bank references for all shareholders. Corporate shareholders must provide audited financials of ultimate holding company.",
  },
  foreign_ownership: {
    max_foreign_equity_general_pct: 100,
    fully_foreign_allowed: true,
    resident_director_required: false,
    local_partner_required: false,
    min_investment_threshold: null,
    min_investment_currency: null,
    certificate_required:
      "Foreign Enterprise Certification (K2,000) via IPA — mandatory AFTER company registration",
  },
  land: {
    customary_pct: 97,
    government_pct: 3,
    freehold_pct: 0,
    foreign_freehold_allowed: false,
    foreign_freehold_notes:
      "~97% of PNG land is customary — held under clan/tribe ownership. State leases and Special Agricultural and Business Leases (SABL) available. Foreign nationals cannot own customary land. SABLs have been subject to controversy — seek local legal counsel.",
    lease_typical_term_years: "99 (State leases) / 40–99 (SABL, subject to conditions)",
    land_board: "Department of Lands and Physical Planning",
  },
  sector_restrictions: [
    {
      sector: "Small business activities (below K2M threshold)",
      status: "reserved_citizens_only",
      notes: "Small Business Act reserves certain activities for PNG citizens",
    },
    {
      sector: "Mining and petroleum",
      status: "requires_approval",
      notes: "Resource sector — separate mineral/petroleum legislation and licensing",
    },
    {
      sector: "Fisheries",
      status: "requires_approval",
      notes: "Requires National Fisheries Authority licence and, for foreign vessels, Fishing Industry Participation Agreement",
    },
    {
      sector: "Tourism / hospitality",
      status: "open",
      notes: "Open to foreign investment subject to certification",
    },
    {
      sector: "Manufacturing",
      status: "open",
      notes: "Open — Pioneer Industry status available for qualifying investments",
    },
  ],
  setup_steps: [
    "Step 1 (mandatory first): Register company — IPA, Form 1–5 (new company) or Form 46 (overseas company), K500, 24hr–3 weeks",
    "Step 2 (mandatory second): Apply for Foreign Enterprise Certification — IPA Form 3, K2,000, ~5 weeks",
    "Submit comprehensive documents: CVs, police clearances, passports, bank references (individuals); audited financials, shareholder register (corporate shareholders)",
    "Register for GST with Internal Revenue Commission (IRC)",
    "Register for Salaries and Wages Tax (SWT) with IRC",
    "Register with Nasfund or Nambawan Super (superannuation)",
    "Obtain work permits via Department of Labour",
    "Obtain sector-specific licences (NFA for fisheries; MRA for mining; etc.)",
  ],
  data_gaps: ["Annual return fees", "Nasfund/Nambawan contribution rates", "GST registration threshold", "Pioneer Industry eligibility criteria"],
};

const TONGA: NationProfile = {
  code: "to",
  name: "Tonga",
  currency: "Tongan Paʻanga",
  currency_code: "TOP",
  primary_investment_body: "Tonga Trade and Investment Board (TTIB)",
  investment_body_url: "https://www.tongainvest.com",
  business_registry_url: "https://businessregistries.gov.to",
  tax: {
    corporate_tax_pct: 25,
    corporate_tax_note: "Standard rate. Reduced rates may apply to qualifying sectors.",
    vat_gst_pct: 15,
    vat_gst_name: "Consumption Tax (CT)",
    withholding_tax_nonresident_pct: 15,
    income_tax_top_rate_pct: 20,
    income_tax_nontaxable_threshold: "TOP$6,000 per annum (approx — confirm with Revenue Services)",
    double_tax_agreements: [],
    payroll_levy_employer_pct: null,
    payroll_levy_employee_pct: null,
    payroll_fund_name: "Tonga National Retirement Fund (TNRF)",
  },
  setup_cost: {
    currency: "TOP",
    company_registration: 300,
    company_registration_note: "Online incorporation via businessregistries.gov.to — credit card or client account",
    sole_trader_registration: null,
    partnership_registration: null,
    foreign_investment_certificate: null,
    fic_annual_renewal: null,
    annual_return: null,
    other_fees: [
      { label: "Name reservation (20-day window)", amount: "Included in TOP$300 fee" },
      { label: "Foreign investor certification (required for any foreign shareholder)", amount: "Contact TTIB" },
      { label: "Business licence (required after incorporation)", amount: "Contact Tonga Trade and Investment Board" },
    ],
  },
  setup_timeline: {
    company_registration_days: "3–10 business days (Registrar review after online submission)",
    foreign_investment_approval_days: "10–20 business days",
    overall_estimated_weeks: "4–8 weeks",
    notes:
      "Name must end in 'Limited' or 'Limiteti'. Any overseas shareholder (even 1 share) must obtain foreign investor certification. Business licence required separately after incorporation — activity type collected at that stage.",
  },
  foreign_ownership: {
    max_foreign_equity_general_pct: 100,
    fully_foreign_allowed: true,
    resident_director_required: false,
    local_partner_required: false,
    min_investment_threshold: null,
    min_investment_currency: null,
    certificate_required:
      "Foreign investor certification required for ALL overseas shareholders (even minority). Obtained from TTIB.",
  },
  land: {
    customary_pct: 0,
    government_pct: 100,
    freehold_pct: 0,
    foreign_freehold_allowed: false,
    foreign_freehold_notes:
      "ALL land in Tonga is owned by the Crown. No freehold land exists. Land allocated by the Crown via hereditary estates (nobles), town allotments, and tax allotments. Foreigners lease government or noble-held land only. Land is Tonga's most unique constraint for foreign investors.",
    lease_typical_term_years: "20–99 (term lease from Crown/noble-held land)",
    land_board: "Ministry of Lands, Survey and Natural Resources",
  },
  sector_restrictions: [
    {
      sector: "Small retail / kiosks",
      status: "reserved_citizens_only",
      notes: "Small-scale retail reserved for Tongan nationals",
    },
    {
      sector: "Fishing (commercial inshore)",
      status: "restricted_equity_cap",
      notes: "Inshore fishing generally restricted — offshore fishing via licence. Contact TTIB.",
    },
    {
      sector: "Tourism / hospitality",
      status: "open",
      notes: "Priority sector — open to foreign investment",
    },
    {
      sector: "Agriculture / vanilla / squash",
      status: "open",
      notes: "Open — Tonga's primary export sectors",
    },
    {
      sector: "Financial services",
      status: "requires_approval",
      notes: "National Reserve Bank of Tonga approval required",
    },
  ],
  setup_steps: [
    "Reserve company name via businessregistries.gov.to (client account required)",
    "Submit incorporation application online — TOP$300 — provide directors, shareholders, addresses, constitution",
    "Upload government-issued photo ID for all directors and individual shareholders",
    "Await Registrar review — 3–10 business days",
    "Obtain foreign investor certification from TTIB (all overseas shareholders, mandatory)",
    "Apply for business licence — Tonga Trade and Investment Board",
    "Register with Revenue Services Tonga (RST) for Consumption Tax and income tax",
    "Register with Tonga National Retirement Fund (TNRF)",
    "Obtain work permits via Immigration Tonga (if foreign staff)",
    "Open business bank account",
  ],
  data_gaps: ["Exact foreign investor certification fee", "Business licence fee schedule", "TNRF contribution rates", "Income tax threshold confirmation"],
};

const SOLOMON_ISLANDS: NationProfile = {
  code: "sb",
  name: "Solomon Islands",
  currency: "Solomon Islands Dollar",
  currency_code: "SBD",
  primary_investment_body: "Foreign Investment Division — Ministry of Commerce, Industry, Labour and Immigration",
  investment_body_url: "https://commerce.gov.sb",
  business_registry_url: "https://www.solomonbusinessregistry.gov.sb",
  tax: {
    corporate_tax_pct: 30,
    corporate_tax_note: "Standard corporate income tax rate",
    vat_gst_pct: null,
    vat_gst_name: "No GST — customs duties apply",
    withholding_tax_nonresident_pct: 10,
    income_tax_top_rate_pct: 40,
    income_tax_nontaxable_threshold: "SBD$15,000 per annum (approx — confirm with IRD)",
    double_tax_agreements: ["Australia"],
    payroll_levy_employer_pct: 7.5,
    payroll_levy_employee_pct: 5,
    payroll_fund_name: "Solomon Islands National Provident Fund (SINPF)",
  },
  setup_cost: {
    currency: "SBD",
    company_registration: null,
    company_registration_note: "Fees via Solomon Islands Business Registry (solomonbusinessregistry.gov.sb) — exact online schedule unavailable; contact registry directly",
    sole_trader_registration: null,
    partnership_registration: null,
    foreign_investment_certificate: null,
    fic_annual_renewal: null,
    annual_return: null,
    other_fees: [
      { label: "Foreign Investment Registration Certificate (FIRC)", amount: "Contact Foreign Investment Division (+677 22856)" },
      { label: "Annual renewal of FIRC", amount: "Contact Foreign Investment Division" },
    ],
  },
  setup_timeline: {
    company_registration_days: "5–15 business days (estimate — contact registry)",
    foreign_investment_approval_days: "15–30 business days",
    overall_estimated_weeks: "6–10 weeks",
    notes:
      "Contact Foreign Investment Division: (+677) 22856 / 25081–25084. Data gap: exact fees not published online at collection date. Solomon Islands has no GST — customs duty revenue is primary indirect tax.",
  },
  foreign_ownership: {
    max_foreign_equity_general_pct: 100,
    fully_foreign_allowed: true,
    resident_director_required: false,
    local_partner_required: false,
    min_investment_threshold: null,
    min_investment_currency: null,
    certificate_required:
      "Foreign Investment Registration Certificate (FIRC) from Foreign Investment Division",
  },
  land: {
    customary_pct: 87,
    government_pct: 10,
    freehold_pct: 3,
    foreign_freehold_allowed: false,
    foreign_freehold_notes:
      "~87% customary land — accessible via fixed-term estate (lease) only. Government perpetual estates and fixed-term estates available. Foreign investors lease via Commissioner of Lands.",
    lease_typical_term_years: "25–75 (fixed-term estate from Commissioner of Lands)",
    land_board: "Commissioner of Lands — Ministry of Lands, Housing and Survey",
  },
  sector_restrictions: [
    {
      sector: "Certain reserved activities (domestic investors only)",
      status: "reserved_citizens_only",
      notes: "Activities reserved to domestic investors listed in Foreign Investment Act Schedule — contact Foreign Investment Division for current list",
    },
    {
      sector: "Fishing",
      status: "requires_approval",
      notes: "Ministry of Fisheries and Marine Resources licence required. Foreign vessel access via bilateral agreement.",
    },
    {
      sector: "Logging / forestry",
      status: "requires_approval",
      notes: "Ministry of Forestry licence required. High regulatory scrutiny.",
    },
    {
      sector: "Tourism / hospitality",
      status: "open",
      notes: "Priority development sector — open to foreign investment",
    },
    {
      sector: "Mining",
      status: "requires_approval",
      notes: "Mining Act licence required from Ministry of Mines",
    },
  ],
  setup_steps: [
    "Register company at Solomon Islands Business Registry (solomonbusinessregistry.gov.sb)",
    "Obtain Foreign Investment Registration Certificate (FIRC) — Foreign Investment Division",
    "Register with Inland Revenue Division (IRD) for company income tax",
    "Register with Solomon Islands National Provident Fund (SINPF) — SINPF levy: 7.5% employer + 5% employee",
    "Obtain business licence from Ministry of Commerce, Industry, Labour and Immigration",
    "Obtain sector-specific licences (fisheries, forestry, mining as applicable)",
    "Apply for work permits (Immigration Division) for foreign staff",
  ],
  data_gaps: [
    "Exact FIRC fee amounts (not published online)",
    "Company registration fee schedule",
    "Annual return fees",
    "GST/VAT status (no GST — confirm customs duty rates with Customs Division)",
  ],
};

export const PACIFIC_NATIONS: Record<NationCode, NationProfile> = {
  ws: SAMOA,
  fj: FIJI,
  vu: VANUATU,
  pg: PNG,
  to: TONGA,
  sb: SOLOMON_ISLANDS,
};

export const ALL_NATION_CODES: NationCode[] = ["ws", "fj", "vu", "pg", "to", "sb"];

// ─── Regulatory scoring (proprietary SBP synthesis) ──────────────────────────

export interface RegulatoryScore {
  nation: NationCode;
  name: string;
  dimensions: {
    setup_cost_score: number;        // 1–10 (10 = cheapest/easiest)
    setup_speed_score: number;       // 1–10 (10 = fastest)
    foreign_ownership_score: number; // 1–10 (10 = most open)
    tax_burden_score: number;        // 1–10 (10 = lowest burden)
    land_access_score: number;       // 1–10 (10 = easiest access)
    regulatory_complexity: number;   // 1–10 (10 = simplest)
  };
  composite_score: number; // weighted average
  standout_advantage: string;
  primary_constraint: string;
}

/** Pre-computed regulatory scores — SBP proprietary synthesis layer.
 * Methodology: 6 equally-weighted dimensions, 1–10 scale, composite is mean.
 * These represent SBP's structured assessment of official regulatory data.
 * They are NOT legal advice and NOT investment recommendations.
 */
const REGULATORY_SCORES: Record<NationCode, Omit<RegulatoryScore, "nation" | "name">> = {
  ws: {
    dimensions: {
      setup_cost_score: 8,       // Low absolute fees in WST
      setup_speed_score: 6,      // Moderate — FIC adds time
      foreign_ownership_score: 7, // Open but has reserved sectors
      tax_burden_score: 5,       // 27% corporate, 15% VAGST, SNPF 10%+10%
      land_access_score: 4,      // 81% customary — lease only, 20–30yr
      regulatory_complexity: 7,  // Clear FIC process, established MCIL
    },
    composite_score: 6.2,
    standout_advantage: "Clear FIC process, strong DTA network (AUS/NZ/Japan), established infrastructure for Pacific standards",
    primary_constraint: "81% customary land — long-term land access is the primary business risk",
  },
  fj: {
    dimensions: {
      setup_cost_score: 5,       // FJD$300K minimum capital requirement is high
      setup_speed_score: 6,      // Online ROC process good but bank/immigration adds weeks
      foreign_ownership_score: 7, // 100% allowed, resident director required
      tax_burden_score: 6,       // 25% corporate (15% if listed), strong DTA network
      land_access_score: 5,      // 91% iTaukei (TLTB) — complex negotiation
      regulatory_complexity: 6,  // Most sophisticated regulatory environment in Pacific
    },
    composite_score: 5.8,
    standout_advantage: "Largest Pacific economy outside PNG, most developed services sector, 8 DTAs, established legal system",
    primary_constraint: "FJD$300K minimum capital requirement; iTaukei land (91%) — TLTB lease negotiation can be slow",
  },
  vu: {
    dimensions: {
      setup_cost_score: 9,       // Zero corporate and personal income tax — unique in Pacific
      setup_speed_score: 9,      // 1–7 days FIRC — fastest in Pacific
      foreign_ownership_score: 9, // 100% allowed, no minimum investment
      tax_burden_score: 10,      // Zero income tax jurisdiction
      land_access_score: 4,      // 97% customary land — all leasehold
      regulatory_complexity: 8,  // Simple FIRC process via eBusiness Link
    },
    composite_score: 8.2,
    standout_advantage: "Zero income tax jurisdiction — unique in Pacific. Fastest setup (1–7 days). No minimum investment. Offshore finance hub.",
    primary_constraint: "97% customary land — all investment requires lease negotiation. Fee schedule not fully published online.",
  },
  pg: {
    dimensions: {
      setup_cost_score: 7,       // K500 + K2,000 — moderate in absolute terms
      setup_speed_score: 3,      // 6–10 weeks total — slowest in group
      foreign_ownership_score: 7, // 100% allowed but certification process is heavy
      tax_burden_score: 4,       // 30% corporate, 42% income tax top rate, 17% withholding
      land_access_score: 3,      // 97% customary land, SABL controversy
      regulatory_complexity: 4,  // Most complex — mandatory 2-step sequence, heavy documentation
    },
    composite_score: 4.7,
    standout_advantage: "Largest Pacific economy — significant natural resources (LNG, mining, fisheries, agriculture). Pioneer Industry status available.",
    primary_constraint: "Highest regulatory complexity — 2-step mandatory sequence with 5-week certification. Land access is the most complex in the region.",
  },
  to: {
    dimensions: {
      setup_cost_score: 9,       // TOP$300 is lowest registration fee in group
      setup_speed_score: 7,      // 3–10 day review, good online portal
      foreign_ownership_score: 8, // 100% allowed, foreign investor cert required for any overseas shareholder
      tax_burden_score: 7,       // 25% corporate, 15% consumption tax — moderate
      land_access_score: 2,      // ALL land is Crown — unique, most constrained in Pacific
      regulatory_complexity: 7,  // Online portal is modern; foreign investor cert adds step
    },
    composite_score: 6.7,
    standout_advantage: "Lowest registration cost (TOP$300). Modern online registry. Politically stable constitutional monarchy.",
    primary_constraint: "ALL land is Crown-owned — no freehold exists. Crown lease negotiation is essential and can be protracted.",
  },
  sb: {
    dimensions: {
      setup_cost_score: 6,       // Fees unknown online — data gap; moderate estimate
      setup_speed_score: 4,      // Slower processes, less digitalisation
      foreign_ownership_score: 7, // 100% allowed, FIRC required
      tax_burden_score: 5,       // 30% corporate, 40% top income rate, SINPF 7.5%+5%
      land_access_score: 5,      // 87% customary — lease via Commissioner of Lands
      regulatory_complexity: 5,  // Significant data gaps — fee schedule not online
    },
    composite_score: 5.3,
    standout_advantage: "No GST system — only customs duties as indirect tax. Significant underdeveloped natural resource base.",
    primary_constraint: "Least digitised regulatory environment in group. FIRC fee schedule not published online — significant investor friction.",
  },
};

// ─── Query functions ──────────────────────────────────────────────────────────

export function getNations(codes?: NationCode[]): NationProfile[] {
  const keys = codes?.length ? codes : ALL_NATION_CODES;
  return keys.map((k) => PACIFIC_NATIONS[k]).filter(Boolean);
}

export function getTaxComparison(codes?: NationCode[]) {
  return getNations(codes).map((n) => ({
    nation: n.code,
    name: n.name,
    currency: n.currency_code,
    corporate_tax_pct: n.tax.corporate_tax_pct,
    corporate_tax_note: n.tax.corporate_tax_note,
    vat_gst_pct: n.tax.vat_gst_pct,
    vat_gst_name: n.tax.vat_gst_name,
    income_tax_top_rate_pct: n.tax.income_tax_top_rate_pct,
    income_tax_nontaxable_threshold: n.tax.income_tax_nontaxable_threshold,
    withholding_tax_nonresident_pct: n.tax.withholding_tax_nonresident_pct,
    double_tax_agreements: n.tax.double_tax_agreements,
    payroll_levy_total_pct: n.tax.payroll_levy_employer_pct !== null && n.tax.payroll_levy_employee_pct !== null
      ? n.tax.payroll_levy_employer_pct + n.tax.payroll_levy_employee_pct
      : null,
    payroll_fund: n.tax.payroll_fund_name,
  }));
}

export function getLandTenureComparison(codes?: NationCode[]) {
  return getNations(codes).map((n) => ({
    nation: n.code,
    name: n.name,
    customary_pct: n.land.customary_pct,
    government_pct: n.land.government_pct,
    freehold_pct: n.land.freehold_pct,
    foreign_freehold_allowed: n.land.foreign_freehold_allowed,
    foreign_freehold_notes: n.land.foreign_freehold_notes,
    lease_typical_term_years: n.land.lease_typical_term_years,
    land_board: n.land.land_board,
  }));
}

export interface SectorQueryResult {
  sector_query: string;
  results: {
    nation: NationCode;
    name: string;
    matching_restrictions: SectorRestriction[];
    has_restrictions: boolean;
  }[];
}

export function getSectorRestrictions(sectorKeyword?: string, codes?: NationCode[]): SectorQueryResult {
  const nations = getNations(codes);
  const keyword = sectorKeyword?.toLowerCase();

  return {
    sector_query: sectorKeyword ?? "all",
    results: nations.map((n) => {
      const matches = keyword
        ? n.sector_restrictions.filter(
            (r) =>
              r.sector.toLowerCase().includes(keyword) ||
              r.notes.toLowerCase().includes(keyword)
          )
        : n.sector_restrictions;

      return {
        nation: n.code,
        name: n.name,
        matching_restrictions: matches,
        has_restrictions: matches.some((m) => m.status !== "open"),
      };
    }),
  };
}

export function getRegulatoryScores(codes?: NationCode[], sector?: string): RegulatoryScore[] {
  const keys = codes?.length ? codes : ALL_NATION_CODES;
  return keys.map((k) => ({
    nation: k,
    name: PACIFIC_NATIONS[k].name,
    ...REGULATORY_SCORES[k],
  })).sort((a, b) => b.composite_score - a.composite_score);
}

export function getSetupChecklist(nation: NationCode, entity_type: "company" | "sole_trader" | "partnership" = "company") {
  const n = PACIFIC_NATIONS[nation];
  if (!n) return null;

  return {
    nation: n.code,
    name: n.name,
    entity_type,
    currency: n.currency_code,
    primary_investment_body: n.primary_investment_body,
    investment_body_url: n.investment_body_url,
    business_registry_url: n.business_registry_url,
    foreign_certificate_required: n.foreign_ownership.certificate_required,
    min_investment_threshold: n.foreign_ownership.min_investment_threshold
      ? `${n.foreign_ownership.min_investment_currency} ${n.foreign_ownership.min_investment_threshold}`
      : null,
    estimated_timeline: n.setup_timeline.overall_estimated_weeks,
    key_costs: n.setup_cost,
    steps: n.setup_steps,
    land_access_summary: n.land.foreign_freehold_notes,
    data_gaps: n.data_gaps,
    disclaimer:
      "This checklist reflects official sources at October 2026. Verify current requirements with the relevant national authority before proceeding.",
  };
}

export function getSetupComparison(codes?: NationCode[], focus?: string) {
  const nations = getNations(codes);

  return nations.map((n) => ({
    nation: n.code,
    name: n.name,
    currency: n.currency_code,
    primary_investment_body: n.primary_investment_body,
    setup: {
      company_registration_fee: n.setup_cost.company_registration
        ? `${n.currency_code} ${n.setup_cost.company_registration}`
        : "Contact registry",
      foreign_certificate_required: n.foreign_ownership.certificate_required,
      estimated_total_timeline: n.setup_timeline.overall_estimated_weeks,
      min_investment: n.foreign_ownership.min_investment_threshold
        ? `${n.foreign_ownership.min_investment_currency} ${n.foreign_ownership.min_investment_threshold}`
        : "None stated",
      fully_foreign_owned: n.foreign_ownership.fully_foreign_allowed,
      resident_director_required: n.foreign_ownership.resident_director_required,
    },
    tax: {
      corporate_tax_pct: n.tax.corporate_tax_pct,
      vat_gst_pct: n.tax.vat_gst_pct,
      zero_tax_jurisdiction: n.code === "vu",
      dta_count: n.tax.double_tax_agreements.length,
    },
    land: {
      customary_pct: n.land.customary_pct,
      foreign_freehold_allowed: n.land.foreign_freehold_allowed,
      lease_term: n.land.lease_typical_term_years,
    },
    score: {
      composite: REGULATORY_SCORES[n.code].composite_score,
      standout_advantage: REGULATORY_SCORES[n.code].standout_advantage,
      primary_constraint: REGULATORY_SCORES[n.code].primary_constraint,
    },
    data_gaps: n.data_gaps,
  }));
}
