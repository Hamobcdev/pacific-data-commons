import {
  createManualPaymentFetch,
  decodeSettlementFromResponse,
  getManualPaymentAddress,
  type PdcAlgorandNetwork,
} from "@pdc/x402-adapter";
import type {
  CulturalSensitivity,
  DataCategory,
  DirectorySearchResult,
  PDPResponseBase,
  PricingTier,
  TrustTier,
} from "@pdc/shared-types";

/**
 * PDC client for agent endpoint queries (Deliverable 3).
 *
 * The agent's operational wallet pays for directory searches and endpoint
 * queries — never the user's wallet (R2/Model F). Every payment goes
 * through @pdc/x402-adapter's createManualPaymentFetch, which wraps the
 * official Algorand x402 tutorial's wrapFetchWithPayment + toClientAvmSigner
 * flow. No file in apps/agents imports @x402/fetch or @x402/avm directly —
 * CLAUDE.md Section 17/18 confines every @x402/* import to
 * pdc-x402-adapter, and that rule covers this app's operational wallet the
 * same way it already covers apps/sbp-agent's dogfooding agent.
 */

export interface AgentWallet {
  address: string;
  payingFetch: typeof fetch;
}

export function createAgentWallet(privateKeyBase64: string, network: PdcAlgorandNetwork): AgentWallet {
  return {
    address: getManualPaymentAddress(privateKeyBase64),
    payingFetch: createManualPaymentFetch({ privateKeyBase64, network }),
  };
}

export interface DirectoryEndpointResult {
  endpoint_id: string;
  endpoint_url: string;
  /** Session 17 — endpoints.integrity_url ("typically endpoint_url +
   * '/integrity'", session1_migration.sql), read from the directory rather
   * than derived by string-concatenating endpoint_url here: the provider
   * declares it, and a provider that hasn't set one yet (NULL) must resolve
   * to 'endpoint_unavailable' (non-blocking), not a guessed URL that 404s. */
  integrity_url: string | null;
  title: string;
  category: DataCategory;
  countries: string[] | null;
  provider_institution: string;
  trust_tier: TrustTier;
  pricing_tiers: PricingTier[];
  indigenous_data_flag: boolean;
  cultural_sensitivity: CulturalSensitivity;
  permitted_use_cases: string[];
}

export interface PDCQueryResult {
  endpoint_id: string;
  data: unknown;
  algo_tx_id: string;
  amount_usdc: number;
  provenance_hash: string;
  source_category: DataCategory;
  queried_at: string;
}

/**
 * GET /search on the directory API ($0.01 per query, paid by the agent
 * wallet — Decision 8). Only returns active endpoints with a resolvable
 * endpoint_url: an agent can't query an endpoint it can't reach or that's
 * been paused, so filtering here keeps every caller (BaseAgent, tests) from
 * repeating the same isActive/endpointUrl guard.
 */
export async function searchDirectory(
  wallet: AgentWallet,
  directoryUrl: string,
  category: DataCategory,
  country?: string,
): Promise<DirectoryEndpointResult[]> {
  const params = new URLSearchParams({ category });
  if (country) params.set("country", country);
  const url = `${directoryUrl.replace(/\/$/, "")}/search?${params.toString()}`;

  const res = await wallet.payingFetch(url);
  if (!res.ok) {
    throw new Error(`Directory search for category "${category}" returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as DirectorySearchResult;

  return body.results
    .filter((item) => item.endpoint.isActive && item.endpoint.endpointUrl)
    .map((item) => ({
      endpoint_id: item.endpoint.id,
      endpoint_url: item.endpoint.endpointUrl as string,
      integrity_url: item.endpoint.integrityUrl,
      title: item.endpoint.title,
      category: item.endpoint.dataCategory,
      countries: item.endpoint.geography.countries,
      provider_institution: item.provider.institutionName,
      trust_tier: item.provider.trustTier,
      pricing_tiers: item.endpoint.pricingTiers as PricingTier[],
      indigenous_data_flag: item.endpoint.sovereignty.indigenousDataFlag,
      cultural_sensitivity: item.endpoint.sovereignty.culturalSensitivity,
      permitted_use_cases: item.endpoint.sovereignty.permittedUseCases ?? [],
    }));
}

/**
 * Pays for and fetches a single pricing tier off a provider endpoint,
 * returning the on-chain settlement (algo_tx_id) alongside the PDP-1.0
 * envelope's data and provenance_hash — everything BaseAgent needs to build
 * a DataCitation without re-parsing the envelope itself.
 *
 * Takes the full DirectoryEndpointResult (not a bare endpointUrl string) so
 * the tier's `path` and `price_usdc` can be resolved from pricing_tiers —
 * a bare tier number has no way to know which route on the provider's
 * endpoint corresponds to it.
 */
export async function queryEndpoint(
  wallet: AgentWallet,
  endpoint: DirectoryEndpointResult,
  tierNumber: number,
): Promise<PDCQueryResult> {
  const tier = endpoint.pricing_tiers.find((t) => t.tier === tierNumber);
  if (!tier) {
    throw new Error(`Endpoint "${endpoint.title}" has no pricing tier ${tierNumber}`);
  }

  const url = `${endpoint.endpoint_url.replace(/\/$/, "")}${tier.path}`;
  const res = await wallet.payingFetch(url);
  if (!res.ok) {
    throw new Error(`Query to "${endpoint.title}" (${url}) returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as PDPResponseBase;
  const settlement = decodeSettlementFromResponse(res);

  return {
    endpoint_id: endpoint.endpoint_id,
    data: body.data,
    algo_tx_id: settlement?.algoTxId ?? "",
    amount_usdc: settlement ? tier.price_usdc : body.amount_paid_usdc,
    provenance_hash: body.provider.provenance_hash,
    source_category: endpoint.category,
    queried_at: new Date().toISOString(),
  };
}
