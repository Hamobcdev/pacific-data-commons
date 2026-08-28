/**
 * SBP-assisted deployment price (CLAUDE.md Section 7's Node Deployment
 * Service table: "$25 USDC per dataset" standard price, currently waived
 * as a promotional period). Application-layer constant per Session 37B's
 * migration comment — deployment_invoices.invoice_amount_usdc is populated
 * from this value, not hardcoded per-row. Flipping this to 25 is the only
 * change needed to reintroduce pricing; AssistedCard.tsx already branches
 * on whether this is > 0.
 */
export const ASSISTED_DEPLOYMENT_PRICE_USDC = 0;

export const BANK_TRANSFER_SURCHARGE_USD = 50;
