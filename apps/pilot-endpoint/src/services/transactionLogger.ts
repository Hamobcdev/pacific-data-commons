import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettledPdcPayment } from "@pdc/x402-adapter";
import { logger } from "../lib/logger.js";
import type { DirectoryContext } from "./directoryContext.js";

interface PathConfig {
  /** transactions_log.transaction_type — CHECK-constrained to
   * data_query_tier1..5 (session1_migration.sql), by pricing tier, not by
   * dataset. All three Session 21 routes price at the tier-1 rate. */
  transactionType: string;
  pricingTier: number;
  /** transactions_log.response_tier — free text (no CHECK constraint), so
   * unlike transactionType this can and does distinguish datasets that
   * share the same pricing tier — see resolveDirectoryContext's doc
   * comment on why that distinction matters for correct attribution. */
  responseTier: string;
}

/**
 * transactions_log.transaction_type / pricing_tier — the schema's own
 * comment (session1_migration.sql) enumerates these 1:1 against tier
 * number, matching this endpoint's 5 fisheries paid routes exactly:
 * /summary=1, /slice=2, /full=3, /expert=4, /commission=5. Session 21's
 * three new routes are all priced at the tier-1 rate (TIER_PRICING.summary,
 * $0.01) — same transaction_type/pricing_tier as /summary, distinguished
 * from it and from each other via response_tier instead.
 */
const PATH_CONFIG: Record<string, PathConfig> = {
  "/summary": { transactionType: "data_query_tier1", pricingTier: 1, responseTier: "summary" },
  "/slice": { transactionType: "data_query_tier2", pricingTier: 2, responseTier: "slice" },
  "/full": { transactionType: "data_query_tier3", pricingTier: 3, responseTier: "full" },
  "/expert": { transactionType: "data_query_tier4", pricingTier: 4, responseTier: "expert" },
  "/commission": { transactionType: "data_query_tier5", pricingTier: 5, responseTier: "commission" },
  "/research/law-before-code": { transactionType: "data_query_tier1", pricingTier: 1, responseTier: "law_before_code" },
  "/research/cryptographic-continuity": { transactionType: "data_query_tier1", pricingTier: 1, responseTier: "cryptographic_continuity" },
  "/pacific/blockchain-adoption": { transactionType: "data_query_tier1", pricingTier: 1, responseTier: "blockchain_adoption" },
};

function configForPath(path: string): PathConfig | null {
  // payment.path is the concrete request path (may include a trailing
  // query string on GET routes like /slice?species=...) — strip it before
  // matching, same reasoning as directoryPaymentLogger.ts's prefix match.
  const bare = path.split("?")[0] ?? path;
  return PATH_CONFIG[bare] ?? null;
}

/**
 * Writes one transactions_log row per settled payment on this endpoint's 5
 * paid routes (Workstream 1, Session 19 — this endpoint previously had no
 * database connection at all; see types/env.ts and lib/supabase.ts).
 *
 * Tier 1-2 (summary, slice): no in-flow split exists — the payTo address IS
 * the provider's own wallet, so the provider already received 100% on-chain
 * the moment settlement happened. This function's job for those tiers is
 * bookkeeping only: record the transaction and accrue the SBP's-cut-owed
 * total via increment_tier12_accrual (Decision 16/31 — invoiced monthly
 * above the $10 threshold), same RPC session1_migration.sql already defines
 * and directory-api has never had reason to call before now.
 *
 * Tier 3-5 (full, expert, commission): no on-chain split contract exists
 * yet either (Decision 17 — Tier 5 escrow deferred to Phase 2, manual
 * invoice + delivery during POC). provider_amount/sbp_fee_amount are still
 * populated here with the *intended* split (the schema's own comment: these
 * columns exist for "Tier 3-5 in-flow split") so SBP has a record to invoice
 * against manually; split_executed stays false because no split actually
 * ran.
 *
 * Never throws — a logging failure must not affect a request whose payment
 * has already settled and whose response has already been sent.
 */
export async function logSettledEndpointPayment(
  supabase: SupabaseClient,
  payment: SettledPdcPayment,
  context: DirectoryContext | null,
): Promise<void> {
  if (!context) {
    // resolveDirectoryContext() already logged why — nothing new to add
    // per-payment beyond a lightweight counter would be noisy.
    return;
  }

  const config = configForPath(payment.path);
  if (!config) {
    logger.warn("settled_payment_unrecognized_path", { path: payment.path, algoTxId: payment.algoTxId });
    return;
  }

  const { transactionType, pricingTier, responseTier } = config;
  const amountUsdc = Number(payment.amountUsdc);
  const isTier12 = pricingTier <= 2;

  const { error: insertError } = await supabase.from("transactions_log").insert({
    transaction_type: transactionType,
    provider_id: context.providerId,
    endpoint_id: context.endpointId,
    algo_tx_id: payment.algoTxId,
    amount_usdc: payment.amountUsdc,
    pricing_tier: pricingTier,
    provider_amount: isTier12 ? null : (amountUsdc * context.providerPct) / 100,
    sbp_fee_amount: isTier12 ? null : (amountUsdc * context.sbpFeePct) / 100,
    split_executed: false,
    buyer_wallet_address: payment.payerAddress ?? null,
    response_tier: responseTier,
  });

  if (insertError) {
    logger.error("endpoint_query_log_failed", {
      algoTxId: payment.algoTxId,
      path: payment.path,
      error: insertError.message,
    });
    return;
  }

  if (isTier12) {
    const { error: accrualError } = await supabase.rpc("increment_tier12_accrual", {
      p_provider_id: context.providerId,
      p_amount: amountUsdc,
    });
    if (accrualError) {
      logger.error("tier12_accrual_failed", {
        algoTxId: payment.algoTxId,
        providerId: context.providerId,
        error: accrualError.message,
      });
    }
  }

  const { error: countError } = await supabase.rpc("increment_provider_query_count", {
    p_provider_id: context.providerId,
  });
  if (countError) {
    logger.error("provider_query_count_increment_failed", {
      algoTxId: payment.algoTxId,
      providerId: context.providerId,
      error: countError.message,
    });
  }
}
