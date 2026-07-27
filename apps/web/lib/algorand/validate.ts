/**
 * Algorand address validation without an SDK. This checks *format* only
 * (58-char RFC4648 base32, no padding) — not the embedded checksum.
 *
 * Real Algorand address checksums use SHA-512/256, which isn't available in
 * Web Crypto (`crypto.subtle` supports SHA-256/384/512, not the distinct
 * truncated-512/256 variant) and implementing it from scratch just to avoid
 * a one-line SDK dependency isn't worth the risk of a subtly-wrong
 * hand-rolled hash silently passing bad addresses. Format validation catches
 * the overwhelming majority of real mistakes (wrong length, pasted extra
 * whitespace, wrong charset); the actual strong check is the live Algod
 * lookup in actions/onboarding/save-wallet.ts — querying an address that
 * doesn't decode to a real account fails there regardless of what this
 * function says.
 */
const ALGORAND_ADDRESS_RE = /^[A-Z2-7]{58}$/;

export function isValidAddressFormat(address: string): boolean {
  return ALGORAND_ADDRESS_RE.test(address.trim());
}

export interface AddressFormatCheck {
  valid: boolean;
  reason: "empty" | "wrong_length" | "invalid_characters" | null;
}

/** Same check as isValidAddressFormat, but with a reason — used to give
 * specific inline feedback (WalletInput) rather than a single pass/fail. */
export function checkAddressFormat(address: string): AddressFormatCheck {
  const trimmed = address.trim();
  if (trimmed.length === 0) return { valid: false, reason: "empty" };
  if (trimmed.length !== 58) return { valid: false, reason: "wrong_length" };
  if (!/^[A-Z2-7]+$/.test(trimmed)) return { valid: false, reason: "invalid_characters" };
  return { valid: true, reason: null };
}
