/**
 * GET / JSON discovery index content (feat/discoverability) — addresses
 * Frits Zwager (Fizzl)'s x402 Doctor recommendation: a root URL that
 * previously answered a bare JSON 404 for any non-HTML request now
 * describes what PDC offers, its price range, and its discovery endpoint.
 *
 * A plain builder function, not a route — routes/branding.ts's existing
 * GET / handler already owns this path (it serves an OG-tagged HTML page
 * for `Accept: text/html` requests, falling through to c.notFound() for
 * everything else — bare agent/curl calls included, which is the exact
 * 404 this addresses). Mounting a second, separate `GET /` router would
 * silently shadow that existing HTML behaviour instead of complementing
 * it, so this plugs into branding.ts's non-HTML branch directly.
 */
export function buildRootIndexResponse() {
  return {
    name: "Pacific Data Commons",
    description:
      "Sovereign data marketplace for Pacific Island nations and institutions. Payment-gated endpoints delivering climate, fisheries, trade, economic, tourism, and jurisdiction intelligence data for AI agents and researchers.",
    version: "1.0",
    provider: "Synergy Blockchain Pacific",
    website: "https://pdc.synergybcpacific.com",
    api_base: "https://api.synergybcpacific.com",
    payment_protocol: "x402",
    chains_accepted: ["algorand", "base", "solana"],
    price_range_usdc: {
      min: 0.001,
      max: 1.0,
    },
    discovery: "https://api.synergybcpacific.com/.well-known/x402",
    categories: {
      climate_ocean: {
        description: "Pacific sea level, ENSO index, cyclone history, ocean temperature, forecasts",
        price_range: "$0.05",
        example: "GET /climate/pacific-sea-level",
      },
      economic: {
        description: "CPI, GDP, FX rates, remittance corridors, arbitrage signals for Pacific nations",
        price_range: "$0.01 – $0.10",
        example: "GET /finance/samoa-cpi",
      },
      tourism: {
        description: "Destinations, accommodation, activities, safety, cultural protocols, transport across 13 Pacific Island nations",
        price_range: "$0.05 – $0.25",
        example: "GET /tourism/destination/WS",
      },
      investment_regulatory: {
        description: "Tax comparison, land tenure, sector restrictions, setup checklists for Pacific jurisdictions",
        price_range: "$0.25",
        example: "GET /invest/pacific-tax-comparison",
      },
      jurisdiction_intelligence: {
        description: "Samoa and Vanuatu entity setup, banking, compliance status, registered agents, IBC setup — no comparable x402 source exists",
        price_range: "$0.50 – $1.00",
        example: "GET /pacific/samoa-entity-setup",
      },
      search: {
        description: "Cross-Pacific endpoint search and directory queries",
        price_range: "$0.001 – $0.25",
        example: "GET /search?q=samoa+climate",
      },
    },
    x402_info: {
      facilitator_algorand: "https://facilitator.goplausible.xyz",
      well_known: "https://api.synergybcpacific.com/.well-known/x402",
      docs: "https://pdc.synergybcpacific.com",
    },
  } as const;
}
