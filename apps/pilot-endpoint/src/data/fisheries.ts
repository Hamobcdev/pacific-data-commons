/**
 * Synthetic Pacific fisheries dataset for PDC platform demonstration.
 *
 * IMPORTANT: These values are FABRICATED for testing the Pacific Data Commons
 * payment infrastructure. They are modelled on realistic tuna stock assessment
 * structure but are not real scientific data.
 *
 * Do not use for research, commercial, or policy decisions.
 */

export const DATASET_METADATA = {
  title: "Pacific Tuna Stock Assessment — PDC Demo (Synthetic)",
  provider: "Pacific Data Commons — SBP Platform Demonstration",
  institution: "Synergy Blockchain Pacific",
  institution_type: "platform_demo",
  country: "Samoa",
  geography: "Samoa and Tonga EEZ (synthetic coverage)",
  time_period_start: 2018,
  time_period_end: 2023,
  update_frequency: "static",
  schema_version: "pdp-1.0",
  category: "fisheries",
  sub_category: "tuna_stock_assessment",
  competition_tag: "x402-global-challenge",
  data_warning:
    "SYNTHETIC DATA: This dataset demonstrates the Pacific Data Commons payment infrastructure. All values are fabricated. Do not use for scientific, commercial, or policy decisions.",
  methodology_summary:
    "Synthetic data generated to demonstrate the Pacific Data Protocol v1.0 response structure. Modelled on Virtual Population Analysis (VPA) methodology used in Pacific tuna stock assessments.",
  citation: "Pacific Data Commons Platform Demo. Synergy Blockchain Pacific, 2026. https://pacificdatacommons.org",
} as const;

export interface FisheriesRecord {
  year: number;
  species: "skipjack" | "yellowfin" | "bigeye";
  catch_volume_mt: number;
  stock_index: number;
  vessel_type: "purse_seine" | "longline" | "pole_and_line";
  zone: "samoa_eez" | "tonga_eez";
  confidence_level: "synthetic";
}

// Dataset sorted by year ASC, then species ASC — deterministic ordering
// for canonical hash computation.
export const FISHERIES_RECORDS: FisheriesRecord[] = [
  { year: 2018, species: "bigeye", catch_volume_mt: 420, stock_index: 0.65, vessel_type: "longline", zone: "samoa_eez", confidence_level: "synthetic" },
  { year: 2018, species: "skipjack", catch_volume_mt: 12450, stock_index: 0.87, vessel_type: "purse_seine", zone: "samoa_eez", confidence_level: "synthetic" },
  { year: 2018, species: "yellowfin", catch_volume_mt: 3200, stock_index: 0.72, vessel_type: "longline", zone: "samoa_eez", confidence_level: "synthetic" },
  { year: 2019, species: "bigeye", catch_volume_mt: 390, stock_index: 0.63, vessel_type: "longline", zone: "samoa_eez", confidence_level: "synthetic" },
  { year: 2019, species: "skipjack", catch_volume_mt: 11890, stock_index: 0.83, vessel_type: "purse_seine", zone: "samoa_eez", confidence_level: "synthetic" },
  { year: 2019, species: "yellowfin", catch_volume_mt: 3450, stock_index: 0.70, vessel_type: "longline", zone: "samoa_eez", confidence_level: "synthetic" },
  { year: 2020, species: "bigeye", catch_volume_mt: 510, stock_index: 0.61, vessel_type: "longline", zone: "tonga_eez", confidence_level: "synthetic" },
  { year: 2020, species: "skipjack", catch_volume_mt: 10200, stock_index: 0.79, vessel_type: "purse_seine", zone: "samoa_eez", confidence_level: "synthetic" },
  { year: 2020, species: "yellowfin", catch_volume_mt: 2980, stock_index: 0.68, vessel_type: "longline", zone: "samoa_eez", confidence_level: "synthetic" },
  { year: 2021, species: "bigeye", catch_volume_mt: 890, stock_index: 0.61, vessel_type: "longline", zone: "samoa_eez", confidence_level: "synthetic" },
  { year: 2021, species: "skipjack", catch_volume_mt: 13100, stock_index: 0.91, vessel_type: "purse_seine", zone: "samoa_eez", confidence_level: "synthetic" },
  { year: 2021, species: "yellowfin", catch_volume_mt: 3650, stock_index: 0.73, vessel_type: "longline", zone: "tonga_eez", confidence_level: "synthetic" },
  { year: 2022, species: "bigeye", catch_volume_mt: 720, stock_index: 0.59, vessel_type: "longline", zone: "tonga_eez", confidence_level: "synthetic" },
  { year: 2022, species: "skipjack", catch_volume_mt: 14200, stock_index: 0.94, vessel_type: "purse_seine", zone: "tonga_eez", confidence_level: "synthetic" },
  { year: 2022, species: "yellowfin", catch_volume_mt: 3800, stock_index: 0.75, vessel_type: "longline", zone: "tonga_eez", confidence_level: "synthetic" },
  { year: 2023, species: "bigeye", catch_volume_mt: 680, stock_index: 0.58, vessel_type: "longline", zone: "samoa_eez", confidence_level: "synthetic" },
  { year: 2023, species: "skipjack", catch_volume_mt: 13750, stock_index: 0.92, vessel_type: "purse_seine", zone: "samoa_eez", confidence_level: "synthetic" },
  { year: 2023, species: "yellowfin", catch_volume_mt: 4100, stock_index: 0.78, vessel_type: "longline", zone: "samoa_eez", confidence_level: "synthetic" },
];
