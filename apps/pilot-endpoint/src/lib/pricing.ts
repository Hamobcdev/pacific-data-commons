/**
 * Single source of truth for all 5 tier prices — used to register payment
 * routes (src/index.ts), to report `amount_paid_usdc` in each paid response
 * (the handler runs before settlement, so it reports the configured price,
 * not a value read back from the facilitator), and to display pricing on
 * the free /health and /schema routes. Change a price here, once.
 */
export const TIER_PRICING = {
  summary: 0.01,
  slice: 0.5,
  full: 25.0,
  expert: 200.0,
  commission: 1000.0,
} as const;

export type TierName = keyof typeof TIER_PRICING;

export function formatUsdc(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
