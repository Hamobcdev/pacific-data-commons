import { createClient, type SupabaseClient, type WebSocketLike, type WebSocketLikeConstructor } from "@supabase/supabase-js";
import { decodeSettlementFromResponse } from "@pdc/x402-adapter";
import type { AgentWallet } from "./pdcClient.js";
import { logger } from "./logger.js";

/**
 * Session 19 / Decision 56 — approved external x402 sources an agent may
 * query as supplementary context alongside its PDC endpoints. PDC data is
 * always primary; see BaseAgent.run()'s Step 5b for how this is wired in.
 *
 * Identical NoopWebSocket workaround to seasonal.ts in this same directory
 * — see that file's doc comment for the full root cause. Not shared into a
 * common module: both are ~15-line workarounds, not worth a new file to
 * dedupe across two call sites in the same package.
 */
class NoopWebSocket implements WebSocketLike {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readonly readyState = 3;
  readonly url = "";
  readonly protocol = "";
  onopen = null;
  onmessage = null;
  onclose = null;
  onerror = null;
  constructor(_address: string | URL, _subprotocols?: string | string[]) {}
  close(): void {}
  send(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

let cachedClient: SupabaseClient | undefined;

function getClient(url: string, serviceKey: string): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: NoopWebSocket as unknown as WebSocketLikeConstructor },
    });
  }
  return cachedClient;
}

export interface ApprovedExternalSource {
  id: string;
  name: string;
  endpointUrl: string;
  priceUsdc: number;
  providerName: string;
}

/**
 * Resolves the external sources a specific agent is approved to query, in
 * query_order (PDC endpoints are always queried first — this list is
 * consulted only after Step 5's PDC loop finishes). Returns an empty array
 * on any failure or when the agent has no permissions rows — an agent with
 * no external sources configured is the overwhelmingly common case (only
 * SBP-approved permissions unlock this at all), not an error.
 */
export async function getApprovedExternalSources(params: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  agentId: string;
}): Promise<ApprovedExternalSource[]> {
  try {
    const supabase = getClient(params.supabaseUrl, params.supabaseServiceKey);
    const { data, error } = await supabase
      .from("agent_external_source_permissions")
      .select("query_order, approved_external_sources(id, name, endpoint_url, price_usdc, provider_name, is_active)")
      .eq("agent_id", params.agentId)
      .order("query_order", { ascending: true });

    if (error || !data) return [];

    return data
      .map((row) => row.approved_external_sources as unknown as
        | { id: string; name: string; endpoint_url: string; price_usdc: number; provider_name: string; is_active: boolean }
        | null)
      .filter((source): source is NonNullable<typeof source> => source !== null && source.is_active)
      .map((source) => ({
        id: source.id,
        name: source.name,
        endpointUrl: source.endpoint_url,
        priceUsdc: Number(source.price_usdc),
        providerName: source.provider_name,
      }));
  } catch (err) {
    logger.warn("external_source_permission_lookup_failed", {
      agentId: params.agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export interface ExternalSourceQueryResult {
  sourceId: string;
  sourceName: string;
  providerName: string;
  data: unknown;
  algoTxId: string;
  amountUsdc: number;
}

/**
 * Pays for and fetches one approved external source. Never throws — an
 * external query failure is explicitly non-fatal (Decision 56): it's
 * supplementary context, not a required input, so a timeout or 5xx from a
 * third party must never fail an otherwise-successful PDC-backed run.
 * Returns null on any failure; the caller logs and continues.
 */
export async function queryExternalSource(wallet: AgentWallet, source: ApprovedExternalSource): Promise<ExternalSourceQueryResult | null> {
  try {
    const res = await wallet.payingFetch(source.endpointUrl);
    if (!res.ok) {
      logger.warn("external_source_query_failed", { sourceId: source.id, sourceName: source.name, status: res.status });
      return null;
    }
    const data: unknown = await res.json();
    const settlement = decodeSettlementFromResponse(res);
    return {
      sourceId: source.id,
      sourceName: source.name,
      providerName: source.providerName,
      data,
      algoTxId: settlement?.algoTxId ?? "",
      amountUsdc: source.priceUsdc,
    };
  } catch (err) {
    logger.warn("external_source_query_error", {
      sourceId: source.id,
      sourceName: source.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
