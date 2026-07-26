import { Hono } from "hono";
import { FISHERIES_RECORDS } from "../../data/fisheries.js";
import { buildPDPResponse, type StockStatus, type SummaryData } from "../../lib/response.js";
import { TIER_PRICING } from "../../lib/pricing.js";
import type { AppBindings } from "../../types.js";

export const summaryRoute = new Hono<AppBindings>();

function stockStatusFor(species: SummaryData["species_covered"][number]): StockStatus {
  const [latest] = FISHERIES_RECORDS.filter((r) => r.species === species).sort((a, b) => b.year - a.year);
  if (!latest) {
    throw new Error(`No records found for species "${species}" — dataset invariant violated`);
  }
  return {
    species,
    latest_year: latest.year,
    stock_index: latest.stock_index,
    status: latest.stock_index >= 0.8 ? "healthy" : latest.stock_index >= 0.65 ? "moderate" : "depleted",
  };
}

summaryRoute.get("/summary", (c) => {
  const species = [...new Set(FISHERIES_RECORDS.map((r) => r.species))];
  const zones = [...new Set(FISHERIES_RECORDS.map((r) => r.zone))];
  const years = [...new Set(FISHERIES_RECORDS.map((r) => r.year))].sort((a, b) => a - b);

  const stockStatus = species.map(stockStatusFor);
  const skipjack = stockStatus.find((s) => s.species === "skipjack");
  const bigeye = stockStatus.find((s) => s.species === "bigeye");
  const latestYear = years[years.length - 1];

  const summary: SummaryData = {
    total_records: FISHERIES_RECORDS.length,
    species_covered: species,
    zones_covered: zones,
    years_covered: years,
    stock_status: stockStatus,
    key_findings: [
      `Skipjack remains the dominant species with stock index ${skipjack?.stock_index} in ${latestYear}`,
      `Bigeye tuna shows the lowest stock index (${bigeye?.stock_index}) and warrants monitoring`,
      `Combined EEZ coverage includes Samoa and Tonga across ${years.length} years of synthetic assessment data`,
    ],
  };

  return c.json(
    buildPDPResponse({
      tier: "summary",
      amountPaidUsdc: TIER_PRICING.summary,
      data: summary,
      queryReceived: {},
      queryApplied: {},
      datasetHash: c.get("datasetHash"),
      publicUrl: c.get("env").PUBLIC_URL,
    }),
  );
});
