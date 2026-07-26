import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettledPdcPayment } from "@pdc/x402-adapter";
import { logger } from "../lib/logger.js";

interface DirectoryQueryContext {
  providerId: string | null;
  endpointId: string | null;
  queryParameters: Record<string, unknown> | null;
}

/**
 * x402 settlement happens after a route handler has already returned its
 * JSON body (see @pdc/x402-adapter — exact scheme only charges on handler
 * success), so this reconstructs "what was actually served" from that same
 * response body rather than needing route handlers to report back
 * separately. Every paid route's response envelope is designed to carry
 * exactly what's needed here.
 */
function deriveContext(payment: SettledPdcPayment): DirectoryQueryContext {
  const body = payment.responseBody as Record<string, unknown> | undefined;

  // payment.path is the concrete request path (e.g. "/provider/<uuid>"), not
  // the registered pattern — see SettledPdcPayment's doc comment. Match by
  // prefix, since the id itself isn't otherwise available at settle time.
  if (payment.path.startsWith("/provider/")) {
    const provider = body?.provider as { id?: string } | undefined;
    return { providerId: provider?.id ?? null, endpointId: null, queryParameters: null };
  }

  if (payment.path.startsWith("/endpoint/")) {
    const endpoint = body?.endpoint as { id?: string; providerId?: string } | undefined;
    return { providerId: endpoint?.providerId ?? null, endpointId: endpoint?.id ?? null, queryParameters: null };
  }

  if (payment.path.startsWith("/verify/")) {
    const verification = body?.verification as { providerId?: string; endpointId?: string } | undefined;
    return {
      providerId: verification?.providerId ?? null,
      endpointId: verification?.endpointId ?? null,
      queryParameters: null,
    };
  }

  if (payment.path === "/search") {
    return {
      providerId: null,
      endpointId: null,
      queryParameters: (body?.filters as Record<string, unknown> | undefined) ?? null,
    };
  }

  return { providerId: null, endpointId: null, queryParameters: null };
}

/**
 * Every settled directory query (search / provider / endpoint / verify) is
 * revenue attributed to SBP directly — never to a provider's tier12 accrual,
 * which is a distinct data-purchase revenue stream owned by Component 5's
 * provider endpoint template (Session 3). transaction_type = 'directory_query'
 * exists in the Session 1 schema specifically for this (Decision 8, Revenue
 * Model Section 7: $0.01/search).
 */
export async function logSettledDirectoryQuery(
  supabase: SupabaseClient,
  payment: SettledPdcPayment,
): Promise<void> {
  const context = deriveContext(payment);

  const { error } = await supabase.from("transactions_log").insert({
    transaction_type: "directory_query",
    provider_id: context.providerId,
    endpoint_id: context.endpointId,
    algo_tx_id: payment.algoTxId,
    amount_usdc: payment.amountUsdc,
    buyer_wallet_address: payment.payerAddress ?? null,
    query_parameters: context.queryParameters,
  });

  if (error) {
    // A logging failure must never take down an already-settled, already-paid
    // request — the buyer already paid and got their response. Surface it
    // loudly instead so it shows up as a platform alert candidate.
    logger.error("directory_query_log_failed", {
      algoTxId: payment.algoTxId,
      route: `${payment.method} ${payment.path}`,
      error: error.message,
    });
  }
}
