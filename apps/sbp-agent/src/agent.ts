import { createManualPaymentFetch, decodeSettlementFromResponse, type PdcAlgorandNetwork } from "@pdc/x402-adapter";
import type { Logger } from "./logger.js";

/** Decision 8 — $0.01 directory query fee, fixed platform-wide. */
const DIRECTORY_QUERY_PRICE_USDC = 0.01;
/** Fallback if a paid response doesn't echo amount_paid_usdc — matches the
 * Tier 1 price every pilot/provider endpoint uses today (Decision 23: Tier
 * 1-2 price cap, $0.01 default for Tier 1). */
const ENDPOINT_SUMMARY_FALLBACK_PRICE_USDC = 0.01;
/** Session 29 — must match WALLET_BALANCE_PRICE_USDC registered for
 * GET /algorand/wallet-balance in apps/directory-api/src/index.ts. The
 * response carries no amount_paid_usdc field to read back (unlike the
 * endpoint /summary query above), so this is logged directly rather than
 * echoed from the response body. */
const WALLET_BALANCE_PRICE_USDC = 0.005;
/** SBP's own directory payTo wallet (CLAUDE.md "Payment flows to" address) —
 * the query subject for the wallet-balance canary check below. Any valid
 * Mainnet address would exercise the endpoint; this one doubles as a live
 * check that SBP's own payTo wallet is funded and USDC opted-in. */
export const WALLET_BALANCE_CANARY_ADDRESS = "LN745UCDQNFIBDY6JFW7FNK333MADQZQVQFMCVR3GXXUTB52O2NYPZN3YY";
/** Session 30 — must match FX_PRICE_USDC registered for GET /finance/fx in
 * apps/directory-api/src/index.ts. Same "logged directly, not echoed back"
 * posture as WALLET_BALANCE_PRICE_USDC above — the FX response carries no
 * amount_paid_usdc field either. */
const FX_PRICE_USDC = 0.001;
/** Session 31 — must match PACIFIC_BRIEF_PRICE_USDC registered for
 * GET /intelligence/pacific-brief in apps/directory-api/src/index.ts. Same
 * "logged directly, not echoed back" posture as WALLET_BALANCE_PRICE_USDC
 * and FX_PRICE_USDC above. */
const PACIFIC_BRIEF_PRICE_USDC = 0.05;
/** Session 32 — must match EVENTS_PRICE_USDC registered for
 * GET /pacific/events in apps/directory-api/src/index.ts. Same "logged
 * directly, not echoed back" posture as FX_PRICE_USDC above. */
const EVENTS_PRICE_USDC = 0.002;
/** Session 32 — must match PACIFIC_TRAVEL_PRICE_USDC registered for
 * GET /intelligence/pacific-travel in apps/directory-api/src/index.ts. Same
 * "logged directly, not echoed back" posture as PACIFIC_BRIEF_PRICE_USDC
 * above. */
const PACIFIC_TRAVEL_PRICE_USDC = 0.1;
/** Session 34 — must match WEATHER_PRICE_USDC registered for
 * GET /pacific/weather in apps/directory-api/src/index.ts. Same "logged
 * directly, not echoed back" posture as EVENTS_PRICE_USDC above. */
const WEATHER_PRICE_USDC = 0.002;

export interface CycleResult {
  cycle_at: string;
  /** Which category this cycle queried — index.ts runs one cycle per
   * category per tick (Session 14), so this is what distinguishes each
   * entry in the /health endpoint's last_cycles array. */
  category: string;
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
 * One complete query cycle for a single category:
 *   1. Query the directory for `category` endpoints ($0.01)
 *   2. Pick the first active endpoint from results
 *   3. Call /summary on that endpoint ($0.01)
 *   4. Return a structured result for the caller to log
 *
 * Both transactions land on the GoPlausible leaderboard attributed to the
 * agent wallet. Dry-run (no agentWalletKey): logs intent and returns
 * immediately — never constructs a payment client, never makes an HTTP call
 * to a paid route (a 402 with no payment would just waste a round trip).
 *
 * Single-category by design (Session 14) — a caller wanting to cover
 * multiple categories (index.ts queries both SEARCH_CATEGORY and "ocean"
 * per tick) calls this once per category rather than this function fanning
 * out internally, so each category's result/error is independently visible
 * to the caller instead of collapsed into one combined outcome.
 */
export async function runQueryCycle(params: {
  directoryUrl: string;
  category: string;
  agentWalletKey: string | undefined;
  network: PdcAlgorandNetwork;
  logger: Logger;
  /** The agent's own operational wallet address, resolved once at startup
   * (index.ts's getWalletStatus()) — same "startup-resolved, not re-derived
   * per cycle" posture index.ts already uses for attribution's
   * originatingUserWallet. Used only to tag canary log lines (Session 26,
   * Volume Integrity Policy); omit in tests that don't care about it. */
  walletAddress?: string | null;
  /** Injectable for tests — defaults to the real adapter. */
  createPayingFetch?: (key: string, network: PdcAlgorandNetwork) => typeof fetch;
}): Promise<CycleResult> {
  const cycleAt = new Date().toISOString();

  if (!params.agentWalletKey) {
    params.logger.info("agent_cycle_dry_run", {
      cycle_at: cycleAt,
      would_query: `${params.directoryUrl}/search?category=${params.category}`,
      would_pay_usdc: DIRECTORY_QUERY_PRICE_USDC,
      reason: "AGENT_WALLET_KEY not set",
    });
    return {
      cycle_at: cycleAt,
      category: params.category,
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
    {
      directoryUrl: params.directoryUrl,
      category: params.category,
      agentWalletKey: params.agentWalletKey,
      network: params.network,
      logger: params.logger,
      walletAddress: params.walletAddress ?? null,
    },
    cycleAt,
    payingFetch,
  );
}

async function runCycleWithPayingFetch(
  params: {
    directoryUrl: string;
    category: string;
    agentWalletKey: string;
    network: PdcAlgorandNetwork;
    logger: Logger;
    walletAddress: string | null;
  },
  cycleAt: string,
  payingFetch: typeof fetch,
): Promise<CycleResult> {
  let directoryResult = emptyDirectoryResult();
  let pickedEndpointUrl: string | null = null;

  // Volume Integrity Policy (Session 26) — the pinned x402 client SDK has no
  // on-chain note/extra hook a payer can attach to (see the doc comment on
  // createManualPaymentFetch in @pdc/x402-adapter), so every settled cycle's
  // structured log carries this instead: type/source/purpose plus the
  // agent's own wallet address, so canary transactions can be cross-
  // referenced by tx_id + wallet address against organic buyer volume.
  const canaryLog = { type: "canary" as const, source: "sbp-agent", purpose: "uptime-monitoring", wallet_address: params.walletAddress };

  try {
    const searchUrl = `${params.directoryUrl.replace(/\/$/, "")}/search?category=${params.category}`;
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
    params.logger.info("agent_directory_query_succeeded", {
      ...directoryResult,
      category: params.category,
      picked_endpoint: pickedEndpointUrl,
      ...canaryLog,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    params.logger.error("agent_directory_query_failed", { error: message, category: params.category });
    return {
      cycle_at: cycleAt,
      category: params.category,
      dry_run: false,
      directory_query: directoryResult,
      endpoint_query: emptyEndpointResult(),
      total_usdc_spent: 0,
      error: message,
    };
  }

  if (!pickedEndpointUrl) {
    const message = `No active ${params.category} endpoint found in directory results`;
    params.logger.warn("agent_no_endpoint_found", { directory_url: params.directoryUrl, category: params.category });
    return {
      cycle_at: cycleAt,
      category: params.category,
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
    params.logger.info("agent_endpoint_query_succeeded", { ...endpointResult, category: params.category, ...canaryLog });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    cycleError = message;
    params.logger.error("agent_endpoint_query_failed", { error: message, endpoint_url: pickedEndpointUrl, category: params.category });
  }

  return {
    cycle_at: cycleAt,
    category: params.category,
    dry_run: false,
    directory_query: directoryResult,
    endpoint_query: endpointResult,
    total_usdc_spent: directoryResult.amount_usdc + endpointResult.amount_usdc,
    error: cycleError,
  };
}

export interface WalletBalanceCanaryResult {
  cycle_at: string;
  dry_run: boolean;
  success: boolean;
  tx_id: string | null;
  amount_usdc: number;
  address: string;
  exists: boolean | null;
  algo_balance: number | null;
  usdc_balance: number | null;
  error: string | null;
}

/** Just enough of GET /algorand/wallet-balance's response shape to log —
 * deliberately not the full route response type, same "untrusted HTTP JSON"
 * posture as DirectorySearchResponseShape above. */
interface WalletBalanceResponseShape {
  exists?: boolean;
  algo_balance?: number;
  usdc_balance?: number;
}

function emptyWalletBalanceResult(cycleAt: string, dryRun: boolean, error: string | null): WalletBalanceCanaryResult {
  return {
    cycle_at: cycleAt,
    dry_run: dryRun,
    success: false,
    tx_id: null,
    amount_usdc: 0,
    address: WALLET_BALANCE_CANARY_ADDRESS,
    exists: null,
    algo_balance: null,
    usdc_balance: null,
    error,
  };
}

/**
 * Session 29 — queries directory-api's GET /algorand/wallet-balance once per
 * tick, not once per category (unlike runQueryCycle above): this is a single
 * category-agnostic utility endpoint, so index.ts calls this once per tick
 * alongside, not inside, the per-category loop.
 *
 * Same dry-run / payingFetch construction as runQueryCycle, and the same
 * Volume Integrity Policy canary-log shape (Session 26) — this settled
 * payment needs to be identifiable against organic buyer volume the same
 * way the directory/endpoint queries already are.
 */
export async function runWalletBalanceCanaryCheck(params: {
  directoryUrl: string;
  agentWalletKey: string | undefined;
  network: PdcAlgorandNetwork;
  logger: Logger;
  /** Same purpose as runQueryCycle's walletAddress param — tags the canary
   * log line, omit in tests that don't care about it. */
  walletAddress?: string | null;
  /** Injectable for tests — defaults to the real adapter. */
  createPayingFetch?: (key: string, network: PdcAlgorandNetwork) => typeof fetch;
}): Promise<WalletBalanceCanaryResult> {
  const cycleAt = new Date().toISOString();

  if (!params.agentWalletKey) {
    params.logger.info("agent_wallet_balance_canary_dry_run", {
      cycle_at: cycleAt,
      would_query: `${params.directoryUrl}/algorand/wallet-balance?address=${WALLET_BALANCE_CANARY_ADDRESS}`,
      would_pay_usdc: WALLET_BALANCE_PRICE_USDC,
      reason: "AGENT_WALLET_KEY not set",
    });
    return emptyWalletBalanceResult(cycleAt, true, null);
  }

  const buildPayingFetch =
    params.createPayingFetch ??
    ((key: string, network: PdcAlgorandNetwork) => createManualPaymentFetch({ privateKeyBase64: key, network }));
  const payingFetch = buildPayingFetch(params.agentWalletKey, params.network);

  // Volume Integrity Policy (Session 26) — see runCycleWithPayingFetch's
  // matching comment above for why this log shape exists instead of an
  // on-chain note field.
  const canaryLog = { type: "canary" as const, source: "sbp-agent", purpose: "uptime-monitoring", wallet_address: params.walletAddress ?? null };

  try {
    const url = `${params.directoryUrl.replace(/\/$/, "")}/algorand/wallet-balance?address=${WALLET_BALANCE_CANARY_ADDRESS}`;
    const res = await payingFetch(url);
    if (!res.ok) {
      throw new Error(`wallet-balance query returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as WalletBalanceResponseShape;
    const settlement = decodeSettlementFromResponse(res);

    const result: WalletBalanceCanaryResult = {
      cycle_at: cycleAt,
      dry_run: false,
      success: true,
      tx_id: settlement?.algoTxId ?? null,
      amount_usdc: WALLET_BALANCE_PRICE_USDC,
      address: WALLET_BALANCE_CANARY_ADDRESS,
      exists: body.exists ?? null,
      algo_balance: body.algo_balance ?? null,
      usdc_balance: body.usdc_balance ?? null,
      error: null,
    };
    params.logger.info("agent_wallet_balance_query_succeeded", { ...result, ...canaryLog });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    params.logger.error("agent_wallet_balance_query_failed", { error: message, address: WALLET_BALANCE_CANARY_ADDRESS });
    return emptyWalletBalanceResult(cycleAt, false, message);
  }
}

export interface FxCanaryResult {
  cycle_at: string;
  dry_run: boolean;
  success: boolean;
  tx_id: string | null;
  amount_usdc: number;
  source: string | null;
  rates_count: number | null;
  error: string | null;
}

/** Just enough of GET /finance/fx's response shape to log — deliberately
 * not the full FxRates type, same "untrusted HTTP JSON" posture as
 * WalletBalanceResponseShape above. */
interface FxResponseShape {
  source?: string;
  rates?: Record<string, number>;
}

function emptyFxResult(cycleAt: string, dryRun: boolean, error: string | null): FxCanaryResult {
  return {
    cycle_at: cycleAt,
    dry_run: dryRun,
    success: false,
    tx_id: null,
    amount_usdc: 0,
    source: null,
    rates_count: null,
    error,
  };
}

/**
 * Session 30 — queries directory-api's GET /finance/fx once per tick, not
 * once per category, same "single category-agnostic utility endpoint"
 * posture as runWalletBalanceCanaryCheck above. No query params: the
 * canary just needs to exercise the endpoint and confirm it's serving
 * rates, not perform a conversion.
 */
export async function runFxCanaryCheck(params: {
  directoryUrl: string;
  agentWalletKey: string | undefined;
  network: PdcAlgorandNetwork;
  logger: Logger;
  /** Same purpose as runWalletBalanceCanaryCheck's walletAddress param —
   * tags the canary log line, omit in tests that don't care about it. */
  walletAddress?: string | null;
  /** Injectable for tests — defaults to the real adapter. */
  createPayingFetch?: (key: string, network: PdcAlgorandNetwork) => typeof fetch;
}): Promise<FxCanaryResult> {
  const cycleAt = new Date().toISOString();

  if (!params.agentWalletKey) {
    params.logger.info("agent_fx_canary_dry_run", {
      cycle_at: cycleAt,
      would_query: `${params.directoryUrl}/finance/fx`,
      would_pay_usdc: FX_PRICE_USDC,
      reason: "AGENT_WALLET_KEY not set",
    });
    return emptyFxResult(cycleAt, true, null);
  }

  const buildPayingFetch =
    params.createPayingFetch ??
    ((key: string, network: PdcAlgorandNetwork) => createManualPaymentFetch({ privateKeyBase64: key, network }));
  const payingFetch = buildPayingFetch(params.agentWalletKey, params.network);

  // Volume Integrity Policy (Session 26) — same canary-log shape as every
  // other canary check in this file.
  const canaryLog = { type: "canary" as const, source: "sbp-agent", purpose: "uptime-monitoring", wallet_address: params.walletAddress ?? null };

  try {
    const url = `${params.directoryUrl.replace(/\/$/, "")}/finance/fx`;
    const res = await payingFetch(url);
    if (!res.ok) {
      throw new Error(`fx query returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as FxResponseShape;
    const settlement = decodeSettlementFromResponse(res);

    const result: FxCanaryResult = {
      cycle_at: cycleAt,
      dry_run: false,
      success: true,
      tx_id: settlement?.algoTxId ?? null,
      amount_usdc: FX_PRICE_USDC,
      source: body.source ?? null,
      rates_count: body.rates ? Object.keys(body.rates).length : null,
      error: null,
    };
    params.logger.info("agent_fx_query_succeeded", { ...result, ...canaryLog });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    params.logger.error("agent_fx_query_failed", { error: message });
    return emptyFxResult(cycleAt, false, message);
  }
}

export interface OrchestratorCanaryResult {
  cycle_at: string;
  dry_run: boolean;
  success: boolean;
  tx_id: string | null;
  amount_usdc: number;
  sub_payments_count: number | null;
  total_sub_payments_usdc: number | null;
  confidence: string | null;
  error: string | null;
}

/** Just enough of GET /intelligence/pacific-brief's response shape to log —
 * deliberately not the full PacificBrief type, same "untrusted HTTP JSON"
 * posture as WalletBalanceResponseShape/FxResponseShape above. */
interface OrchestratorResponseShape {
  payments?: unknown[];
  total_sub_payments_usdc?: number;
  confidence?: string;
}

function emptyOrchestratorResult(cycleAt: string, dryRun: boolean, error: string | null): OrchestratorCanaryResult {
  return {
    cycle_at: cycleAt,
    dry_run: dryRun,
    success: false,
    tx_id: null,
    amount_usdc: 0,
    sub_payments_count: null,
    total_sub_payments_usdc: null,
    confidence: null,
    error,
  };
}

/**
 * Session 31 — queries directory-api's GET /intelligence/pacific-brief once
 * per tick, not once per category, same "single category-agnostic utility
 * endpoint" posture as runWalletBalanceCanaryCheck/runFxCanaryCheck above.
 * A fixed topic/country (fisheries/WS): the canary just needs to exercise
 * the orchestrator end-to-end, not explore every topic. This is the one
 * canary check that itself triggers further sub-payments server-side (the
 * orchestrator pays 3 more PDC sub-endpoints per call) — one canary tick
 * here contributes up to 4 settled leaderboard transactions, not 1.
 */
export async function runOrchestratorCanaryCheck(params: {
  directoryUrl: string;
  agentWalletKey: string | undefined;
  network: PdcAlgorandNetwork;
  logger: Logger;
  /** Same purpose as runWalletBalanceCanaryCheck's walletAddress param —
   * tags the canary log line, omit in tests that don't care about it. */
  walletAddress?: string | null;
  /** Injectable for tests — defaults to the real adapter. */
  createPayingFetch?: (key: string, network: PdcAlgorandNetwork) => typeof fetch;
}): Promise<OrchestratorCanaryResult> {
  const cycleAt = new Date().toISOString();

  if (!params.agentWalletKey) {
    params.logger.info("agent_orchestrator_canary_dry_run", {
      cycle_at: cycleAt,
      would_query: `${params.directoryUrl}/intelligence/pacific-brief?topic=fisheries&country=WS`,
      would_pay_usdc: PACIFIC_BRIEF_PRICE_USDC,
      reason: "AGENT_WALLET_KEY not set",
    });
    return emptyOrchestratorResult(cycleAt, true, null);
  }

  const buildPayingFetch =
    params.createPayingFetch ??
    ((key: string, network: PdcAlgorandNetwork) => createManualPaymentFetch({ privateKeyBase64: key, network }));
  const payingFetch = buildPayingFetch(params.agentWalletKey, params.network);

  // Volume Integrity Policy (Session 26) — same canary-log shape as every
  // other canary check in this file.
  const canaryLog = { type: "canary" as const, source: "sbp-agent", purpose: "uptime-monitoring", wallet_address: params.walletAddress ?? null };

  try {
    const url = `${params.directoryUrl.replace(/\/$/, "")}/intelligence/pacific-brief?topic=fisheries&country=WS`;
    const res = await payingFetch(url);
    if (!res.ok) {
      throw new Error(`pacific-brief query returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as OrchestratorResponseShape;
    const settlement = decodeSettlementFromResponse(res);

    const result: OrchestratorCanaryResult = {
      cycle_at: cycleAt,
      dry_run: false,
      success: true,
      tx_id: settlement?.algoTxId ?? null,
      amount_usdc: PACIFIC_BRIEF_PRICE_USDC,
      sub_payments_count: body.payments?.length ?? null,
      total_sub_payments_usdc: body.total_sub_payments_usdc ?? null,
      confidence: body.confidence ?? null,
      error: null,
    };
    params.logger.info("agent_orchestrator_query_succeeded", { ...result, ...canaryLog });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    params.logger.error("agent_orchestrator_query_failed", { error: message });
    return emptyOrchestratorResult(cycleAt, false, message);
  }
}

export interface EventsCanaryResult {
  cycle_at: string;
  dry_run: boolean;
  success: boolean;
  tx_id: string | null;
  amount_usdc: number;
  results_count: number | null;
  error: string | null;
}

/** Just enough of GET /pacific/events's response shape to log — deliberately
 * not the full PacificEvent type, same "untrusted HTTP JSON" posture as
 * FxResponseShape/OrchestratorResponseShape above. */
interface EventsResponseShape {
  results?: unknown[];
  count?: number;
}

function emptyEventsResult(cycleAt: string, dryRun: boolean, error: string | null): EventsCanaryResult {
  return {
    cycle_at: cycleAt,
    dry_run: dryRun,
    success: false,
    tx_id: null,
    amount_usdc: 0,
    results_count: null,
    error,
  };
}

/**
 * Session 32 — queries directory-api's GET /pacific/events once per tick,
 * same "single category-agnostic utility endpoint" posture as
 * runFxCanaryCheck/runWalletBalanceCanaryCheck above. Fixed to Samoa
 * (country=WS) and a 90-day window — the canary just needs to exercise the
 * endpoint end-to-end, not explore every country/category combination.
 */
export async function runEventsCanaryCheck(params: {
  directoryUrl: string;
  agentWalletKey: string | undefined;
  network: PdcAlgorandNetwork;
  logger: Logger;
  /** Same purpose as runFxCanaryCheck's walletAddress param — tags the
   * canary log line, omit in tests that don't care about it. */
  walletAddress?: string | null;
  /** Injectable for tests — defaults to the real adapter. */
  createPayingFetch?: (key: string, network: PdcAlgorandNetwork) => typeof fetch;
}): Promise<EventsCanaryResult> {
  const cycleAt = new Date().toISOString();

  if (!params.agentWalletKey) {
    params.logger.info("agent_events_canary_dry_run", {
      cycle_at: cycleAt,
      would_query: `${params.directoryUrl}/pacific/events?country=WS&days_ahead=90`,
      would_pay_usdc: EVENTS_PRICE_USDC,
      reason: "AGENT_WALLET_KEY not set",
    });
    return emptyEventsResult(cycleAt, true, null);
  }

  const buildPayingFetch =
    params.createPayingFetch ??
    ((key: string, network: PdcAlgorandNetwork) => createManualPaymentFetch({ privateKeyBase64: key, network }));
  const payingFetch = buildPayingFetch(params.agentWalletKey, params.network);

  // Volume Integrity Policy (Session 26) — same canary-log shape as every
  // other canary check in this file.
  const canaryLog = { type: "canary" as const, source: "sbp-agent", purpose: "uptime-monitoring", wallet_address: params.walletAddress ?? null };

  try {
    const url = `${params.directoryUrl.replace(/\/$/, "")}/pacific/events?country=WS&days_ahead=90`;
    const res = await payingFetch(url);
    if (!res.ok) {
      throw new Error(`pacific/events query returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as EventsResponseShape;
    const settlement = decodeSettlementFromResponse(res);

    const result: EventsCanaryResult = {
      cycle_at: cycleAt,
      dry_run: false,
      success: true,
      tx_id: settlement?.algoTxId ?? null,
      amount_usdc: EVENTS_PRICE_USDC,
      results_count: body.count ?? (body.results ? body.results.length : null),
      error: null,
    };
    params.logger.info("agent_events_query_succeeded", { ...result, ...canaryLog });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    params.logger.error("agent_events_query_failed", { error: message });
    return emptyEventsResult(cycleAt, false, message);
  }
}

export interface TourismCanaryResult {
  cycle_at: string;
  dry_run: boolean;
  success: boolean;
  tx_id: string | null;
  amount_usdc: number;
  sub_payments_count: number | null;
  total_sub_payments_usdc: number | null;
  confidence: string | null;
  error: string | null;
}

/** Just enough of GET /intelligence/pacific-travel's response shape to log —
 * deliberately not the full PacificTravelBrief type, same "untrusted HTTP
 * JSON" posture as OrchestratorResponseShape above. */
interface TourismResponseShape {
  payments?: unknown[];
  total_sub_payments_usdc?: number;
  confidence?: string;
}

function emptyTourismResult(cycleAt: string, dryRun: boolean, error: string | null): TourismCanaryResult {
  return {
    cycle_at: cycleAt,
    dry_run: dryRun,
    success: false,
    tx_id: null,
    amount_usdc: 0,
    sub_payments_count: null,
    total_sub_payments_usdc: null,
    confidence: null,
    error,
  };
}

const FAILED_PAYMENT_BODY_MAX_CHARS = 2000;

/**
 * Session 35 investigation — reads the full body and payment-related
 * headers off a non-ok response BEFORE it's discarded, so the actual
 * x402/facilitator rejection reason reaches the logs instead of just the
 * bare HTTP status. Safe to call on any Response: every read is wrapped so
 * a body-read failure degrades to null fields rather than throwing a
 * second error out of an already-failing path. Header names match
 * decodeSettlementFromResponse's own PAYMENT-RESPONSE/payment-response
 * fallback pattern in @pdc/x402-adapter, plus PAYMENT-REQUIRED (a second
 * 402 challenge, if that's what the server sent back) and X-PAYMENT-RESPONSE
 * (the alternate name @x402/fetch lists in its CORS expose-headers set).
 */
async function describeFailedPaymentResponse(res: Response): Promise<{
  status: number;
  body: unknown;
  payment_response_header: string | null;
  payment_required_header: string | null;
}> {
  let body: unknown = null;
  try {
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text.length > FAILED_PAYMENT_BODY_MAX_CHARS ? `${text.slice(0, FAILED_PAYMENT_BODY_MAX_CHARS)}…(truncated)` : text;
      }
    }
  } catch {
    body = null;
  }

  return {
    status: res.status,
    body,
    payment_response_header: res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("payment-response") ?? res.headers.get("X-PAYMENT-RESPONSE") ?? null,
    payment_required_header: res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required") ?? null,
  };
}

/**
 * Session 32 — queries directory-api's GET /intelligence/pacific-travel
 * once per tick, same "single category-agnostic utility endpoint" posture
 * as runOrchestratorCanaryCheck above. Fixed to Samoa (destination=WS),
 * default travel_window — the canary just needs to exercise the tourism
 * orchestrator end-to-end, not explore every destination/window. Same as
 * the pacific-brief canary, this one canary tick itself triggers 3 further
 * sub-payments server-side (events + fx + fisheries), contributing up to 4
 * settled leaderboard transactions per tick, not 1.
 */
export async function runTourismCanaryCheck(params: {
  directoryUrl: string;
  agentWalletKey: string | undefined;
  network: PdcAlgorandNetwork;
  logger: Logger;
  /** Same purpose as runOrchestratorCanaryCheck's walletAddress param —
   * tags the canary log line, omit in tests that don't care about it. */
  walletAddress?: string | null;
  /** Injectable for tests — defaults to the real adapter. */
  createPayingFetch?: (key: string, network: PdcAlgorandNetwork) => typeof fetch;
}): Promise<TourismCanaryResult> {
  const cycleAt = new Date().toISOString();

  if (!params.agentWalletKey) {
    params.logger.info("agent_tourism_canary_dry_run", {
      cycle_at: cycleAt,
      would_query: `${params.directoryUrl}/intelligence/pacific-travel?destination=WS`,
      would_pay_usdc: PACIFIC_TRAVEL_PRICE_USDC,
      reason: "AGENT_WALLET_KEY not set",
    });
    return emptyTourismResult(cycleAt, true, null);
  }

  const buildPayingFetch =
    params.createPayingFetch ??
    ((key: string, network: PdcAlgorandNetwork) => createManualPaymentFetch({ privateKeyBase64: key, network }));
  const payingFetch = buildPayingFetch(params.agentWalletKey, params.network);

  // Volume Integrity Policy (Session 26) — same canary-log shape as every
  // other canary check in this file.
  const canaryLog = { type: "canary" as const, source: "sbp-agent", purpose: "uptime-monitoring", wallet_address: params.walletAddress ?? null };

  try {
    const url = `${params.directoryUrl.replace(/\/$/, "")}/intelligence/pacific-travel?destination=WS`;
    const res = await payingFetch(url);
    if (!res.ok) {
      // wrapFetchWithPayment (Session 34/35 investigation) retries a 402
      // with a real signed payment and, if the server rejects that
      // settlement, returns the second response as-is — a 402 here does
      // NOT mean "never paid," it can mean "paid, and the server/
      // facilitator rejected the settlement." The response body and
      // PAYMENT-RESPONSE/PAYMENT-REQUIRED headers carry the actual
      // rejection reason; without reading them here that reason is lost
      // and only the bare status code ever reaches the logs.
      const failure = await describeFailedPaymentResponse(res);
      params.logger.error("agent_tourism_payment_rejected", { cycle_at: cycleAt, ...failure, ...canaryLog });
      throw new Error(`pacific-travel query returned HTTP ${res.status} — ${JSON.stringify(failure)}`);
    }
    const body = (await res.json()) as TourismResponseShape;
    const settlement = decodeSettlementFromResponse(res);

    const result: TourismCanaryResult = {
      cycle_at: cycleAt,
      dry_run: false,
      success: true,
      tx_id: settlement?.algoTxId ?? null,
      amount_usdc: PACIFIC_TRAVEL_PRICE_USDC,
      sub_payments_count: body.payments?.length ?? null,
      total_sub_payments_usdc: body.total_sub_payments_usdc ?? null,
      confidence: body.confidence ?? null,
      error: null,
    };
    params.logger.info("agent_tourism_query_succeeded", { ...result, ...canaryLog });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    params.logger.error("agent_tourism_query_failed", { error: message });
    return emptyTourismResult(cycleAt, false, message);
  }
}

export interface WeatherCanaryResult {
  cycle_at: string;
  dry_run: boolean;
  success: boolean;
  tx_id: string | null;
  amount_usdc: number;
  temperature_c: number | null;
  tourism_rating: string | null;
  error: string | null;
}

/** Just enough of GET /pacific/weather's response shape to log —
 * deliberately not the full PacificWeather type, same "untrusted HTTP
 * JSON" posture as EventsResponseShape/FxResponseShape above. */
interface WeatherResponseShape {
  current?: {
    temperature_c?: number;
    tourism_rating?: string;
  };
}

function emptyWeatherResult(cycleAt: string, dryRun: boolean, error: string | null): WeatherCanaryResult {
  return {
    cycle_at: cycleAt,
    dry_run: dryRun,
    success: false,
    tx_id: null,
    amount_usdc: 0,
    temperature_c: null,
    tourism_rating: null,
    error,
  };
}

/**
 * Session 34 — queries directory-api's GET /pacific/weather once per tick,
 * same "single category-agnostic utility endpoint" posture as
 * runEventsCanaryCheck above. Fixed to Samoa (country=WS) — the canary
 * just needs to exercise the endpoint end-to-end, not explore every
 * country.
 */
export async function runWeatherCanaryCheck(params: {
  directoryUrl: string;
  agentWalletKey: string | undefined;
  network: PdcAlgorandNetwork;
  logger: Logger;
  /** Same purpose as runEventsCanaryCheck's walletAddress param — tags the
   * canary log line, omit in tests that don't care about it. */
  walletAddress?: string | null;
  /** Injectable for tests — defaults to the real adapter. */
  createPayingFetch?: (key: string, network: PdcAlgorandNetwork) => typeof fetch;
}): Promise<WeatherCanaryResult> {
  const cycleAt = new Date().toISOString();

  if (!params.agentWalletKey) {
    params.logger.info("agent_weather_canary_dry_run", {
      cycle_at: cycleAt,
      would_query: `${params.directoryUrl}/pacific/weather?country=WS`,
      would_pay_usdc: WEATHER_PRICE_USDC,
      reason: "AGENT_WALLET_KEY not set",
    });
    return emptyWeatherResult(cycleAt, true, null);
  }

  const buildPayingFetch =
    params.createPayingFetch ??
    ((key: string, network: PdcAlgorandNetwork) => createManualPaymentFetch({ privateKeyBase64: key, network }));
  const payingFetch = buildPayingFetch(params.agentWalletKey, params.network);

  // Volume Integrity Policy (Session 26) — same canary-log shape as every
  // other canary check in this file.
  const canaryLog = { type: "canary" as const, source: "sbp-agent", purpose: "uptime-monitoring", wallet_address: params.walletAddress ?? null };

  try {
    const url = `${params.directoryUrl.replace(/\/$/, "")}/pacific/weather?country=WS`;
    const res = await payingFetch(url);
    if (!res.ok) {
      throw new Error(`pacific/weather query returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as WeatherResponseShape;
    const settlement = decodeSettlementFromResponse(res);

    const result: WeatherCanaryResult = {
      cycle_at: cycleAt,
      dry_run: false,
      success: true,
      tx_id: settlement?.algoTxId ?? null,
      amount_usdc: WEATHER_PRICE_USDC,
      temperature_c: body.current?.temperature_c ?? null,
      tourism_rating: body.current?.tourism_rating ?? null,
      error: null,
    };
    params.logger.info("agent_weather_query_succeeded", { ...result, ...canaryLog });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    params.logger.error("agent_weather_query_failed", { error: message });
    return emptyWeatherResult(cycleAt, false, message);
  }
}
