import { createHash, timingSafeEqual } from "node:crypto";
import nacl from "tweetnacl";

/**
 * Minimal Algorand address / Ed25519 signature verification for the
 * attribution endpoint (Decision 37) — no algosdk dependency. Session 6.1
 * brief explicitly calls for this: "If the Algorand SDK is not already in
 * the directory-api dependencies, use a minimal verification approach —
 * Algorand signatures are Ed25519, verifiable with tweetnacl [...] which has
 * no Algorand dependency." algosdk is not a directory-api dependency
 * (confirmed by reading package.json before writing this file), so this is
 * the path taken.
 *
 * An Algorand address is base32(pubkey[32] || checksum[4]) — the last 4
 * bytes of SHA-512/256 over the public key — encoded without padding.
 * Node's `crypto` module supports the 'sha512-256' digest directly (unlike
 * the browser's Web Crypto API, which only exposes SHA-256/384/512 — see
 * apps/web/lib/algorand/validate.ts's comment on why *that* file only
 * checks address *format*, not the checksum. directory-api runs on Node, so
 * this file checks the checksum for real.)
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const ALGORAND_ADDRESS_RE = /^[A-Z2-7]{58}$/;
const ALGORAND_ADDRESS_BYTES = 36; // 32-byte public key + 4-byte checksum
const CHECKSUM_BYTES = 4;

function base32Decode(input: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of input) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`invalid base32 character: "${char}"`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(output);
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

function checksumOf(publicKey: Uint8Array): Uint8Array {
  const digest = createHash("sha512-256").update(publicKey).digest();
  return new Uint8Array(digest.subarray(digest.length - CHECKSUM_BYTES));
}

export interface DecodedAlgorandAddress {
  publicKey: Uint8Array;
}

/** Throws on malformed input or checksum mismatch — never returns a partial result. */
export function decodeAlgorandAddress(address: string): DecodedAlgorandAddress {
  const trimmed = address.trim().toUpperCase();
  if (!ALGORAND_ADDRESS_RE.test(trimmed)) {
    throw new Error("malformed Algorand address");
  }

  const decoded = base32Decode(trimmed);
  if (decoded.length !== ALGORAND_ADDRESS_BYTES) {
    throw new Error("malformed Algorand address");
  }

  const publicKey = decoded.subarray(0, 32);
  const checksum = decoded.subarray(32, 36);
  const expectedChecksum = checksumOf(publicKey);

  if (!timingSafeEqual(Buffer.from(checksum), Buffer.from(expectedChecksum))) {
    throw new Error("Algorand address checksum mismatch");
  }

  return { publicKey };
}

/** Inverse of decodeAlgorandAddress — used by tests to build a real address from a keypair. */
export function encodeAlgorandAddress(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error("Algorand public key must be 32 bytes");
  }
  const combined = new Uint8Array(ALGORAND_ADDRESS_BYTES);
  combined.set(publicKey, 0);
  combined.set(checksumOf(publicKey), 32);
  return base32Encode(combined);
}

const ATTRIBUTION_SIGNATURE_VERSION = "v1";

/**
 * The exact string an agent's operational wallet must sign for a
 * POST /agent/attribution submission (Decision 37).
 */
export function buildAttributionSignedMessage(params: {
  runId: string;
  agentId: string;
  nonce: string;
  timestamp: string;
}): string {
  return `pdc-attribution:${ATTRIBUTION_SIGNATURE_VERSION}:${params.runId}:${params.agentId}:${params.nonce}:${params.timestamp}`;
}

/**
 * Raw Ed25519 verification over UTF-8 message bytes — no "TX"-style prefix.
 * That prefix is specific to signing Algorand transactions; general
 * application-level attestations like this one are signed as plain bytes
 * (the same shape as algosdk's signBytes/verifyBytes helpers), which is what
 * this function verifies against. Never throws — a malformed address or
 * signature is simply not a valid signature.
 */
export function verifyAlgorandSignature(address: string, message: string, signatureBase64: string): boolean {
  let publicKey: Uint8Array;
  try {
    ({ publicKey } = decodeAlgorandAddress(address));
  } catch {
    return false;
  }

  let signature: Uint8Array;
  try {
    signature = new Uint8Array(Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
  if (signature.length !== 64) {
    return false;
  }

  const messageBytes = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(messageBytes, signature, publicKey);
}
