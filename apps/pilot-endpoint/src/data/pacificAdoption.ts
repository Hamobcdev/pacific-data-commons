/**
 * Session 21 (Deliverable 2) — Pacific blockchain and digital asset
 * adoption landscape. Publicly available regulatory/policy information,
 * compiled into structured, programmatically queryable form for the first
 * time — that structuring is the product's value, not the underlying facts
 * (which are all sourced from public regulatory announcements, government
 * digital economy strategies, and Forum Secretariat documentation).
 */

export interface NationAdoptionRecord {
  country: string;
  iso: string;
  regulatory_sandbox: boolean;
  sandbox_enacted: string | null;
  cbdc_research: boolean;
  cbdc_stage: "none" | "research" | "pilot_ready";
  digital_economy_strategy: boolean;
  blockchain_infrastructure: boolean;
  lagatoi_signatory: boolean;
  notes: string;
}

export const PACIFIC_ADOPTION_NATIONS: NationAdoptionRecord[] = [
  {
    country: "Samoa",
    iso: "WS",
    regulatory_sandbox: true,
    sandbox_enacted: "2024",
    cbdc_research: true,
    cbdc_stage: "pilot_ready",
    digital_economy_strategy: true,
    blockchain_infrastructure: true,
    lagatoi_signatory: true,
    notes: "First Pacific SIDS with live x402 blockchain data marketplace (PDC, Aug 2026)",
  },
  {
    country: "Fiji",
    iso: "FJ",
    regulatory_sandbox: false,
    sandbox_enacted: null,
    cbdc_research: true,
    cbdc_stage: "research",
    digital_economy_strategy: true,
    blockchain_infrastructure: false,
    lagatoi_signatory: true,
    notes: "RBF exploring digital currency. Active FinTech regulation development.",
  },
  {
    country: "Tonga",
    iso: "TO",
    regulatory_sandbox: false,
    sandbox_enacted: null,
    cbdc_research: false,
    cbdc_stage: "none",
    digital_economy_strategy: true,
    blockchain_infrastructure: false,
    lagatoi_signatory: true,
    notes: "Digital economy strategy in development. No active blockchain regulatory framework.",
  },
  {
    country: "Vanuatu",
    iso: "VU",
    regulatory_sandbox: false,
    sandbox_enacted: null,
    cbdc_research: false,
    cbdc_stage: "none",
    digital_economy_strategy: true,
    blockchain_infrastructure: false,
    lagatoi_signatory: true,
    notes: "Financial inclusion focus. No active blockchain regulatory framework.",
  },
  {
    country: "Papua New Guinea",
    iso: "PG",
    regulatory_sandbox: false,
    sandbox_enacted: null,
    cbdc_research: true,
    cbdc_stage: "research",
    digital_economy_strategy: true,
    blockchain_infrastructure: false,
    lagatoi_signatory: true,
    notes: "BPNG exploring digital payments. Mobile money focus.",
  },
  {
    country: "Solomon Islands",
    iso: "SB",
    regulatory_sandbox: false,
    sandbox_enacted: null,
    cbdc_research: false,
    cbdc_stage: "none",
    digital_economy_strategy: true,
    blockchain_infrastructure: false,
    lagatoi_signatory: true,
    notes: "Digital economy strategy early stage.",
  },
  {
    country: "Cook Islands",
    iso: "CK",
    regulatory_sandbox: false,
    sandbox_enacted: null,
    cbdc_research: false,
    cbdc_stage: "none",
    digital_economy_strategy: true,
    blockchain_infrastructure: false,
    lagatoi_signatory: true,
    notes: "Freely associated state. Tourism-focused digital economy.",
  },
  {
    country: "Tokelau",
    iso: "TK",
    regulatory_sandbox: false,
    sandbox_enacted: null,
    cbdc_research: false,
    cbdc_stage: "none",
    digital_economy_strategy: false,
    blockchain_infrastructure: false,
    lagatoi_signatory: false,
    notes: "Non-self-governing territory of NZ. Tokelau Apia Liaison Office primary contact.",
  },
];

export const PACIFIC_ADOPTION_METADATA = {
  dataset: "Pacific Blockchain and Digital Asset Adoption Landscape",
  version: "1.0",
  compiled: "2026-08-17",
  compiler: "Synergy Blockchain Pacific",
  methodology: "Compiled from publicly available regulatory announcements, government digital economy strategies, and Forum Secretariat documentation",
  coverage: "Pacific Islands Forum member states",
  data_currency: "Accurate as of August 2026. Subject to change as regulatory environments develop.",
} as const;
