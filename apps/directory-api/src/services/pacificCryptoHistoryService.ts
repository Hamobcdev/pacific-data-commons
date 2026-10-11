import { ValidationError } from "../lib/errors.js";
import type { CryptoRate, HistoryPoint } from "../handlers/cronCryptoPriceFetcher.js";
import type { KVNamespace } from "@cloudflare/workers-types";

// Shared query logic for /finance/crypto-history and the Agent Dataset
// Gateway's query adapter — extracted from
// routes/finance/crypto-history.ts (see that file for the full
// timeframe/KV-windowing doc comment) so the two callers can't drift.

const TRACKED_SYMBOLS = new Set(["ALGO", "BTC", "ETH", "XRP", "XLM", "USDC", "USDT"]);

export type Timeframe = "5m" | "15m" | "1h" | "4h" | "8h" | "1D" | "1W" | "1M";

const TIMEFRAME_POINTS: Record<Timeframe, number> = {
  "5m": 1,
  "15m": 3,
  "1h": 12,
  "4h": 48,
  "8h": 96,
  "1D": 288,
  "1W": 288,
  "1M": 288,
};

const LONG_RANGE_NOTE: Record<"1W" | "1M", string> = {
  "1W": "1W requests 7 days of history; the KV history buffer currently retains at most 24h (288 points at 5-minute intervals) — returning everything available instead.",
  "1M": "1M requests 30 days of history; the KV history buffer currently retains at most 24h (288 points at 5-minute intervals) — returning everything available instead.",
};

export interface CryptoHistoryQueryParams {
  symbol?: string;
  tf?: string;
}

export interface CryptoHistoryResult {
  symbol: string;
  timeframe: Timeframe;
  points: HistoryPoint[];
  point_count: number;
  max_available_points: number;
  note: string | null;
}

export async function queryCryptoHistory(params: CryptoHistoryQueryParams, kv: KVNamespace | undefined): Promise<CryptoHistoryResult> {
  const symbol = params.symbol?.toUpperCase();
  if (!symbol) {
    throw new ValidationError("symbol query parameter is required, e.g. ?symbol=ALGO");
  }
  if (!TRACKED_SYMBOLS.has(symbol)) {
    throw new ValidationError(`"${symbol}" is not a tracked symbol. Supported: ${Array.from(TRACKED_SYMBOLS).join(", ")}`);
  }

  const tfRaw = params.tf ?? "1D";
  if (!Object.prototype.hasOwnProperty.call(TIMEFRAME_POINTS, tfRaw)) {
    throw new ValidationError(`tf must be one of: ${Object.keys(TIMEFRAME_POINTS).join(", ")} (got "${tfRaw}")`);
  }
  const tf = tfRaw as Timeframe;

  // No KV binding (Node local dev) or no history written yet both mean
  // "nothing to window" — an empty array, same never-502 posture as
  // /finance/crypto-rates, not an error.
  const storedRates: CryptoRate[] = kv ? ((await kv.get<CryptoRate[]>(`history:${symbol}`, { type: "json" })) ?? []) : [];
  const allPoints: HistoryPoint[] = storedRates.map((rate) => ({ t: rate.last_updated, p: rate.price_usd }));

  const windowSize = TIMEFRAME_POINTS[tf];
  const points = allPoints.slice(-windowSize);

  return {
    symbol,
    timeframe: tf,
    points,
    point_count: points.length,
    max_available_points: allPoints.length,
    note: tf === "1W" || tf === "1M" ? LONG_RANGE_NOTE[tf] : null,
  };
}
