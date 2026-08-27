/**
 * Mirrors apps/directory-api/src/services/pacificTourismService.ts's
 * PacificTravelBrief — deliberate duplicate, not a shared import: apps/web
 * and apps/directory-api are separate deployable services with no shared
 * runtime dependency beyond @pdc/shared-types and @pdc/x402-adapter, same
 * "deliberate duplicate" reasoning already established for
 * apps/agents/src/lib/claudeClient.ts and apps/sbp-agent/src/lib/attribution.ts.
 * This is the shape POST /internal/tourism-demo returns as JSON.
 */
export interface TourismSubPayment {
  endpoint: string;
  category: string;
  tx_id: string | null;
  amount_usdc: number;
}

export interface TravelEventSummary {
  name: string;
  dates: string;
  impact: string | null;
}

export interface WeatherSummary {
  current_conditions: string;
  week_summary: string;
  tourism_rating: string;
  forecast_days: number;
}

export interface PacificTourismStats {
  country_code: string;
  country_name: string;
  year: number;
  international_arrivals: number | null;
  tourism_receipts_usd_millions: number | null;
  avg_spend_per_visitor_usd: number | null;
  avg_length_stay_days: number | null;
  peak_months: string[] | null;
  low_months: string[] | null;
  source: string;
  data_quality: string;
}

export interface PacificTravelBrief {
  destination: string;
  travel_window: string;
  executive_summary: string;
  upcoming_events: TravelEventSummary[];
  seasonal_context: string;
  exchange_rates: { note: string; key_rates: Record<string, number> } | null;
  weather: WeatherSummary | null;
  tourism_stats: PacificTourismStats | null;
  booking_advice: string;
  data_sources: Array<{ name: string; queried_at: string; category: string }>;
  /** Session 34 — nullable now that events/FX/weather/tourism stats are
   * all real: this is only ever populated when the fisheries/marine
   * sub-endpoint is part of the run, scoped explicitly to that source. */
  data_warning: string | null;
  confidence: "high" | "medium" | "low";
  payments: TourismSubPayment[];
  total_sub_payments_usdc: number;
  orchestrated_at: string;
  run_id: string;
}
