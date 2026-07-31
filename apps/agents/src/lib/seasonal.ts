import {
  createClient,
  type SupabaseClient,
  type WebSocketLike,
  type WebSocketLikeConstructor,
} from "@supabase/supabase-js";

export type SeasonalDomain = "fisheries" | "agriculture" | "climate";

/**
 * Satisfies @supabase/realtime-js's WebSocketLikeConstructor shape without
 * ever opening a socket. This module only ever does plain database reads
 * (.from("seasonal_contexts").select(...)) — never .channel()/.subscribe()
 * — but SupabaseClient's constructor unconditionally builds a
 * RealtimeClient regardless, which eagerly calls
 * WebSocketFactory.getWebSocketConstructor() and throws immediately on any
 * Node runtime without a native global WebSocket (stable only from Node
 * 22). That crash happens at createClient() time, not first use — the same
 * root cause and fix as apps/directory-api/src/lib/supabase.ts; see that
 * file's comment for the full trace, including why a `params.eventsPerSecond`
 * workaround does not work (it isn't part of RealtimeClientOptions and has
 * no effect on WebSocketFactory resolution).
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
      // See NoopWebSocket's doc comment above for why this is required.
      realtime: { transport: NoopWebSocket as unknown as WebSocketLikeConstructor },
    });
  }
  return cachedClient;
}

/** Nov(11)–Apr(4)-style wraparound ranges need this instead of a plain
 * start <= month <= end comparison. */
function monthInRange(month: number, start: number, end: number): boolean {
  return start <= end ? month >= start && month <= end : month >= start || month <= end;
}

/**
 * Retrieves the reviewed seasonal_contexts row (session6_1_agent_schema.sql
 * DOMAIN 6) covering the current month for a geography/domain pair. Content
 * is expert-reviewed ahead of time — this only reads, never writes.
 *
 * `reviewed_at IS NOT NULL` is enforced here as an application-level rule,
 * not just relied on via RLS: this service authenticates with the
 * service-role key, which bypasses RLS entirely, so the same "only reviewed
 * context reaches an agent prompt" guarantee the public RLS policy gives
 * anon readers has to be re-asserted in the query itself.
 *
 * Returns null on no match or any DB error — this must never block an agent
 * run (Deliverable 4's own spec: graceful degradation, not a hard failure).
 */
export async function getSeasonalContext(params: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  geography: string;
  domain: SeasonalDomain;
  now?: Date;
}): Promise<string | null> {
  try {
    const supabase = getClient(params.supabaseUrl, params.supabaseServiceKey);
    const month = (params.now ?? new Date()).getUTCMonth() + 1;

    const { data, error } = await supabase
      .from("seasonal_contexts")
      .select("context_notes, month_start, month_end")
      .eq("geography_scope", params.geography)
      .eq("domain", params.domain)
      .not("reviewed_at", "is", null);

    if (error || !data) return null;

    const match = data.find((row) => monthInRange(month, row.month_start as number, row.month_end as number));
    return (match?.context_notes as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Plain-language fallback used only when no reviewed database context
 * exists for the geography/month. Deliberately generic (Pacific-wide
 * cyclone-season boundary only) rather than claiming country-specific or
 * ENSO-phase detail this module has no verified source for — inventing
 * that would be exactly the kind of unverifiable claim P9 exists to
 * prevent. `geography` is accepted for interface symmetry with
 * getSeasonalContext and reserved for a future per-country calendar; it is
 * not yet used to vary the returned string.
 */
export function getCurrentPacificSeason(_geography: string, month: number): string {
  const inCycloneSeason = month >= 11 || month <= 4;
  return inCycloneSeason
    ? "Cyclone season (November–April) across most of the Southwest Pacific."
    : "Dry season (May–October) across most of the Southwest Pacific.";
}
