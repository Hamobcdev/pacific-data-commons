import { createManualPaymentFetch, decodeSettlementFromResponse, type PdcAlgorandNetwork } from "@pdc/x402-adapter";
import type { Logger } from "./logger.js";

/** Decision 8 — $0.01 directory query fee, fixed platform-wide. */
const DIRECTORY_QUERY_PRICE_USDC = 0.01;
/** Fallback if a paid response doesn't echo amount_paid_usdc — matches the
 * Tier 1 price every pilot/provider endpoint uses today (Decision 23: Tier
 * 1-2 price cap, $0.01 default for Tier 1). */
const ENDPOINT_SUMMARY_FALLBACK_PRICE_USDC = 0.01;

export interface CycleResult {
  cycle_at: string;
  dry_run: boolean;
  directory_query: {
    success: boolean;
    tx_id: string | null;
    results_count: number;
    amount_usdc: number;
  };
  endpoint_query: {
    success: boolean;
    tx_id: string | null;
    endpoint_url: string | null;
    tier: string;
    amount_usdc: number;
  };
  total_usdc_spent: number;
  error: string | null;
}

/** Just enough of the directory's /search response shape to pick an
 * endpoint — deliberately not the full shared DirectorySearchResult type,
 * since this is deserializing untrusted HTTP JSON from a possibly-different
 * directory-api deployment, not constructing the response ourselves. */
interface DirectorySearchResponseShape {
  results?: Array<{
    endpoint?: { endpointUrl?: string | null; isActive?: boolean };
  }>;
}

function emptyDirectoryResult(): CycleResult["directory_query"] {
  return { success: false, tx_id: null, results_count: 0, amount_usdc: 0 };
}

function emptyEndpointResult(endpointUrl: string | null = null): CycleResult["endpoint_query"] {
  return { success: false, tx_id: null, endpoint_url: endpointUrl, tier: "summary", amount_usdc: 0 };
}

/**
 * One complete query cycle:
 *   1. Query the directory for fisheries endpoints ($0.01)
 *   2. Pick the first active endpoint from results
 *   3. Call /summary on that endpoint ($0.01)
 *   4. Return a structured result for the caller to log
 *
 * Both transactions land on the GoPlausible leaderboard attributed to the
 * agent wallet. Dry-run (no agentWalletKey): logs intent and returns
 * immediately — never constructs a payment client, never makes an HTTP call
 * to a paid route (a 402 with no payment would just waste a round trip).
 */
export async function runQueryCycle(params: {
  directoryUrl: string;
  agentWalletKey: string | undefined;
  network: PdcAlgorandNetwork;
  logger: Logger;
  /** Injectable for tests — defaults to the real adapter. */
  createPayingFetch?: (key: string, network: PdcAlgorandNetwork) => typeof fetch;
}): Promise<CycleResult> {
  const cycleAt = new Date().toISOString();

  if (!params.agentWalletKey) {
    params.logger.info("agent_cycle_dry_run", {
      cycle_at: cycleAt,
      would_query: `${params.directoryUrl}/search?category=fisheries`,
      would_pay_usdc: DIRECTORY_QUERY_PRICE_USDC,
      reason: "AGENT_WALLET_KEY not set",
    });
    return {
      cycle_at: cycleAt,
      dry_run: true,
      directory_query: emptyDirectoryResult(),
      endpoint_query: emptyEndpointResult(),
      total_usdc_spent: 0,
      error: null,
    };
  }

  const buildPayingFetch =
    params.createPayingFetch ??
    ((key: string, network: PdcAlgorandNetwork) => createManualPaymentFetch({ privateKeyBase64: key, network }));
  const payingFetch = buildPayingFetch(params.agentWalletKey, params.network);

  return runCycleWithPayingFetch(
    { directoryUrl: params.directoryUrl, agentWalletKey: params.agentWalletKey, network: params.network, logger: params.logger },
    cycleAt,
    payingFetch,
  );
}

async function runCycleWithPayingFetch(
  params: { directoryUrl: string; agentWalletKey: string; network: PdcAlgorandNetwork; logger: Logger },
  cycleAt: string,
  payingFetch: typeof fetch,
): Promise<CycleResult> {
  let directoryResult = emptyDirectoryResult();
  let pickedEndpointUrl: string | null = null;

  try {
    const searchUrl = `${params.directoryUrl.replace(/\/$/, "")}/search?category=fisheries`;
    const res = await payingFetch(searchUrl);
    if (!res.ok) {
      throw new Error(`directory search returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as DirectorySearchResponseShape;
    const settlement = decodeSettlementFromResponse(res);
    const results = body.results ?? [];
    const active = results.find((r) => r.endpoint?.isActive && r.endpoint?.endpointUrl);
    pickedEndpointUrl = active?.endpoint?.endpointUrl ?? null;

    directoryResult = {
      success: true,
      tx_id: settlement?.algoTxId ?? null,
      results_count: results.length,
      amount_usdc: DIRECTORY_QUERY_PRICE_USDC,
    };
    params.logger.info("agent_directory_query_succeeded", { ...directoryResult, picked_endpoint: pickedEndpointUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    params.logger.error("agent_directory_query_failed", { error: message });
    return {
      cycle_at: cycleAt,
      dry_run: false,
      directory_query: directoryResult,
      endpoint_query: emptyEndpointResult(),
      total_usdc_spent: 0,
      error: message,
    };
  }

  if (!pickedEndpointUrl) {
    const message = "No active fisheries endpoint found in directory results";
    params.logger.warn("agent_no_endpoint_found", { directory_url: params.directoryUrl });
    return {
      cycle_at: cycleAt,
      dry_run: false,
      directory_query: directoryResult,
      endpoint_query: emptyEndpointResult(),
      total_usdc_spent: directoryResult.amount_usdc,
      error: message,
    };
  }

  let endpointResult = emptyEndpointResult(pickedEndpointUrl);
  let cycleError: string | null = null;

  try {
    const summaryUrl = `${pickedEndpointUrl.replace(/\/$/, "")}/summary`;
    const res = await payingFetch(summaryUrl);
    if (!res.ok) {
      throw new Error(`endpoint /summary returned HTTP ${res.status}`);
    }
    const paidBody = (await res.json()) as { amount_paid_usdc?: number };
    const settlement = decodeSettlementFromResponse(res);
    endpointResult = {
      success: true,
      tx_id: settlement?.algoTxId ?? null,
      endpoint_url: pickedEndpointUrl,
      tier: "summary",
      amount_usdc: paidBody.amount_paid_usdc ?? ENDPOINT_SUMMARY_FALLBACK_PRICE_USDC,
    };
    params.logger.info("agent_endpoint_query_succeeded", endpointResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    cycleError = message;
    params.logger.error("agent_endpoint_query_failed", { error: message, endpoint_url: pickedEndpointUrl });
  }

  return {
    cycle_at: cycleAt,
    dry_run: false,
    directory_query: directoryResult,
    endpoint_query: endpointResult,
    total_usdc_spent: directoryResult.amount_usdc + endpointResult.amount_usdc,
    error: cycleError,
  };
}
