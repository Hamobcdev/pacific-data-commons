import type { Env } from "../lib/env.js";
import { AppError } from "../lib/errors.js";

// Algorand Mainnet USDC ASA — this endpoint always reads Mainnet, regardless
// of this service's own ALGORAND_NETWORK (see env.ts's doc comment on
// ALGORAND_NODE_URL).
const USDC_ASSET_ID = 31566704;
const MICROALGO_TO_ALGO = 1_000_000;
const MICROUSDC_TO_USDC = 1_000_000;
const FETCH_TIMEOUT_MS = 5_000;

// Hardcoded, not configurable via env — a fallback that could be pointed at
// the same host as the primary would defeat CLAUDE.md Section 6's "never
// single node in production."
const ALGONODE_FALLBACK_URL = "https://mainnet-api.algonode.cloud";

// Algorand address: 58-char base32 (RFC 4648, no padding).
const ADDRESS_RE = /^[A-Z2-7]{58}$/;

export function isValidAlgorandAddress(address: string): boolean {
  return ADDRESS_RE.test(address);
}

export interface WalletBalanceResult {
  address: string;
  exists: boolean;
  status: string;
  algo_balance: number;
  usdc_balance: number;
  usdc_opted_in: boolean;
  usdc_asset_id: number;
  min_balance_algo: number;
  network: "mainnet";
  queried_at: string;
  source?: "algonode-fallback";
}

interface AlgodAccount {
  amount?: number;
  status?: string;
  "min-balance"?: number;
  assets?: Array<{ "asset-id": number; amount: number }>;
}

/** Returns the account, or null for a confirmed 404 (account genuinely doesn't exist). Throws on any other failure. */
async function fetchAccount(baseUrl: string, address: string, token?: string): Promise<AlgodAccount | null> {
  const res = await fetch(`${baseUrl}/v2/accounts/${address}`, {
    headers: {
      Accept: "application/json",
      ...(token ? { "X-Algo-API-Token": token } : {}),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`node returned HTTP ${res.status}`);
  return (await res.json()) as AlgodAccount;
}

function buildResult(address: string, account: AlgodAccount | null, source?: "algonode-fallback"): WalletBalanceResult {
  const queried_at = new Date().toISOString();

  if (!account) {
    return {
      address,
      exists: false,
      status: "not-found",
      algo_balance: 0,
      usdc_balance: 0,
      usdc_opted_in: false,
      usdc_asset_id: USDC_ASSET_ID,
      min_balance_algo: 0,
      network: "mainnet",
      queried_at,
      ...(source ? { source } : {}),
    };
  }

  const usdcAsset = (account.assets ?? []).find((a) => a["asset-id"] === USDC_ASSET_ID);

  return {
    address,
    exists: true,
    status: account.status ?? "Online",
    algo_balance: (account.amount ?? 0) / MICROALGO_TO_ALGO,
    usdc_balance: usdcAsset ? usdcAsset.amount / MICROUSDC_TO_USDC : 0,
    usdc_opted_in: Boolean(usdcAsset),
    usdc_asset_id: USDC_ASSET_ID,
    min_balance_algo: (account["min-balance"] ?? 0) / MICROALGO_TO_ALGO,
    network: "mainnet",
    queried_at,
    ...(source ? { source } : {}),
  };
}

/**
 * Nodely primary (env.ALGORAND_NODE_URL), AlgoNode free-tier fallback.
 * A confirmed 404 from the primary is a real answer (account doesn't exist)
 * and returns immediately — it does not fall through to the fallback node,
 * which would just 404 too. Fallback triggers only on a primary node
 * failure (timeout, non-404 HTTP error, network error).
 */
export async function getAlgorandWalletBalance(address: string, env: Env): Promise<WalletBalanceResult> {
  try {
    const account = await fetchAccount(env.ALGORAND_NODE_URL, address, env.NODELY_API_TOKEN);
    return buildResult(address, account);
  } catch {
    try {
      const account = await fetchAccount(ALGONODE_FALLBACK_URL, address);
      return buildResult(address, account, "algonode-fallback");
    } catch {
      throw new AppError(503, "node_unavailable", "Both the primary and fallback Algorand nodes are unavailable. Try again shortly.");
    }
  }
}
