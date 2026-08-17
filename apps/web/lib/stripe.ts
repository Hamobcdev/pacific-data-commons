import Stripe from "stripe";

/**
 * Session 23 (Deliverable 4) — Stripe for online card payment of the
 * deployment/upload fees (CLAUDE.md §7 Node Deployment Service table).
 * Standard e-commerce, not a payment-intermediary function — doesn't
 * require CBS consultation, unlike anything in the x402/USDC settlement
 * path (P2).
 *
 * Lazy client construction (same pattern as app/api/assistant/route.ts's
 * `apiKey` check) rather than a module-top-level `new Stripe(...)` —
 * constructing at import time would throw the moment anything imports this
 * module before STRIPE_SECRET_KEY is set in the environment (e.g. during
 * `next build`'s static analysis, or in local dev before Railway vars are
 * configured), which is exactly the kind of import-order footgun this
 * codebase avoids elsewhere.
 *
 * Pinned to the version this SDK build actually ships (matches
 * `Stripe.ApiVersion` in the installed package) rather than a hand-typed
 * literal that could silently drift from what the SDK supports.
 */
export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return new Stripe(key, { apiVersion: "2026-07-29.dahlia", typescript: true });
}

/**
 * Products (created in the Stripe dashboard, referenced here by their
 * Price IDs via env vars — not hardcoded amounts, since Stripe is the
 * source of truth for what's actually charged):
 * 1. Dataset upload fee — $25 USD (mirrors upload_payments' USDC path,
 *    Decision 58)
 * 2. Scanned PDF surcharge — $10 USD
 * 3. Full deployment service — $150 USD
 * 4. Complex deployment — $300 USD
 * 5. Bank transfer surcharge — $50 USD (invoice path only, not Stripe)
 */
export const STRIPE_PRICE_IDS = {
  uploadFee: process.env.STRIPE_PRICE_UPLOAD_FEE,
  scannedPdfSurcharge: process.env.STRIPE_PRICE_SCANNED_PDF_SURCHARGE,
  deploymentStandard: process.env.STRIPE_PRICE_DEPLOYMENT_STANDARD,
  deploymentComplex: process.env.STRIPE_PRICE_DEPLOYMENT_COMPLEX,
} as const;

export type CheckoutPurpose = "upload_fee" | "deployment_standard" | "deployment_complex";
