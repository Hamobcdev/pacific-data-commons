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

export interface PacificTravelBrief {
  destination: string;
  travel_window: string;
  executive_summary: string;
  upcoming_events: TravelEventSummary[];
  seasonal_context: string;
  exchange_rates: { note: string; key_rates: Record<string, number> } | null;
  booking_advice: string;
  data_sources: Array<{ name: string; queried_at: string; category: string }>;
  data_warning: string;
  confidence: "high" | "medium" | "low";
  payments: TourismSubPayment[];
  total_sub_payments_usdc: number;
  orchestrated_at: string;
  run_id: string;
}
