/**
 * Cron handler: fetch live crypto prices → write to KV
 * Primary:  Kraken REST API  (accessible from CF Workers)
 * Fallback: CoinCap API
 */

import type { Env } from '../lib/env';

export interface CryptoRate {
  symbol: string;
  price_usd: number;
  change_24h_pct: number;
  volume_24h: number;
  market_cap_usd: number;
  last_updated: string;
  source: 'kraken' | 'coincap' | 'static_fallback';
}

const KRAKEN_PAIRS: Record<string, string> = {
  ALGO: 'ALGOUSD',
  BTC:  'XBTUSD',
  ETH:  'ETHUSD',
  XRP:  'XXRPZUSD',
  XLM:  'XXLMZUSD',
  USDC: 'USDCUSD',
  USDT: 'USDTZUSD',
};

const COINCAP_IDS: Record<string, string> = {
  ALGO: 'algorand',
  BTC:  'bitcoin',
  ETH:  'ethereum',
  XRP:  'ripple',
  XLM:  'stellar',
  USDC: 'usd-coin',
  USDT: 'tether',
};

const HISTORY_MAX_POINTS = 288;

async function fetchFromKraken(): Promise<Map<string, CryptoRate> | null> {
  const pairs = Object.values(KRAKEN_PAIRS).join(',');
  const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pairs}`, {
    headers: { 'User-Agent': 'PDC-Directory/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) { console.error(`[cron_crypto] Kraken HTTP ${res.status}`); return null; }
  const json = (await res.json()) as { error: string[]; result: Record<string, { c: [string,string]; o: string; v: [string,string] }> };
  if (json.error?.length) { console.error('[cron_crypto] Kraken error:', json.error); return null; }
  const now = new Date().toISOString();
  const rates = new Map<string, CryptoRate>();
  for (const [symbol, krakenPair] of Object.entries(KRAKEN_PAIRS)) {
    const data = json.result[krakenPair] ?? json.result[krakenPair.replace('USD','ZUSD')];
    if (!data) { console.warn(`[cron_crypto] Kraken: no data for ${symbol}`); continue; }
    const price = parseFloat(data.c[0]);
    const open  = parseFloat(data.o);
    if (!isFinite(price) || price <= 0) continue;
    rates.set(symbol, {
      symbol,
      price_usd:      price,
      change_24h_pct: open > 0 ? parseFloat(((price - open) / open * 100).toFixed(4)) : 0,
      volume_24h:     parseFloat(data.v[1]),
      market_cap_usd: 0,
      last_updated:   now,
      source:         'kraken',
    });
  }
  return rates.size > 0 ? rates : null;
}

async function fetchFromCoinCap(): Promise<Map<string, CryptoRate> | null> {
  const ids = Object.values(COINCAP_IDS).join(',');
  const res = await fetch(`https://api.coincap.io/v2/assets?ids=${ids}&limit=10`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) { console.error(`[cron_crypto] CoinCap HTTP ${res.status}`); return null; }
  const json = (await res.json()) as { data: Array<{ id: string; symbol: string; priceUsd: string; changePercent24Hr: string; volumeUsd24Hr: string; marketCapUsd: string }> };
  if (!json.data?.length) return null;
  const idToSymbol = Object.fromEntries(Object.entries(COINCAP_IDS).map(([s,id]) => [id,s]));
  const now = new Date().toISOString();
  const rates = new Map<string, CryptoRate>();
  for (const asset of json.data) {
    const symbol = idToSymbol[asset.id];
    if (!symbol) continue;
    const price = parseFloat(asset.priceUsd);
    if (!isFinite(price) || price <= 0) continue;
    rates.set(symbol, {
      symbol,
      price_usd:      price,
      change_24h_pct: parseFloat(parseFloat(asset.changePercent24Hr || '0').toFixed(4)),
      volume_24h:     parseFloat(asset.volumeUsd24Hr || '0'),
      market_cap_usd: parseFloat(asset.marketCapUsd || '0'),
      last_updated:   now,
      source:         'coincap',
    });
  }
  return rates.size > 0 ? rates : null;
}

async function appendHistory(kv: KVNamespace, symbol: string, rate: CryptoRate): Promise<void> {
  const key  = `history:${symbol}`;
  const raw  = await kv.get(key);
  const hist: CryptoRate[] = raw ? (JSON.parse(raw) as CryptoRate[]) : [];
  hist.push(rate);
  if (hist.length > HISTORY_MAX_POINTS) hist.splice(0, hist.length - HISTORY_MAX_POINTS);
  await kv.put(key, JSON.stringify(hist), { expirationTtl: 60 * 60 * 48 });
}

export async function cronCryptoPriceFetcher(env: Env): Promise<void> {
  console.info('[cron_crypto] tick start');
  let rates = await fetchFromKraken().catch((err) => {
    console.error('[cron_crypto] Kraken threw:', err?.message ?? err);
    return null;
  });
  if (!rates) {
    console.warn('[cron_crypto] Kraken failed — trying CoinCap');
    rates = await fetchFromCoinCap().catch((err) => {
      console.error('[cron_crypto] CoinCap threw:', err?.message ?? err);
      return null;
    });
  }
  if (!rates) { console.error('[cron_crypto] All sources failed — KV unchanged'); return; }
  const current: Record<string, CryptoRate> = {};
  for (const [symbol, rate] of rates) current[symbol] = rate;
  await env.CRYPTO_PRICES_KV.put('prices:current', JSON.stringify(current), { expirationTtl: 7200 });
  await Promise.all([...rates.values()].map((r) => appendHistory(env.CRYPTO_PRICES_KV, r.symbol, r)));
  const source = [...rates.values()][0]?.source ?? 'unknown';
  console.info(`[cron_crypto] tick complete — ${rates.size} tokens written (source: ${source})`);
}
