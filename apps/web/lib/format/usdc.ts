/**
 * Formats a USDC price for buyer-facing display. `toFixed(2)` alone silently
 * rounds any sub-cent price (e.g. the FX endpoint's real $0.001) down to
 * "$0.00" — showing a paid endpoint as free. Prices of one cent or more (the
 * overwhelming majority) keep the existing two-decimal display unchanged;
 * only genuinely sub-cent prices fall through to the trimmed, higher-
 * precision path below.
 */
export function formatUsdcPrice(amountUsdc: number): string {
  if (amountUsdc === 0 || amountUsdc >= 0.01) {
    return amountUsdc.toFixed(2);
  }
  // Sub-cent: show up to 6 decimal places, trimmed of trailing zeros, so
  // 0.001 renders as "0.001" rather than "0.00" (truncated) or "0.001000"
  // (needlessly padded).
  return amountUsdc.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
