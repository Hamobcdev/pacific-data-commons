import { createClient, type SupabaseClient, type WebSocketLike, type WebSocketLikeConstructor } from "@supabase/supabase-js";
import type { Env } from "./env.js";

/**
 * Satisfies @supabase/realtime-js's WebSocketLikeConstructor shape without
 * ever opening a socket. Mirrors apps/directory-api/src/lib/supabase.ts's
 * NoopWebSocket — see that file's doc comment for the full explanation:
 * SupabaseClient's constructor eagerly resolves a WebSocket constructor
 * even though this service never calls .channel()/.subscribe(), and that
 * resolution throws on Railway runtimes without a native global WebSocket.
 * Supplying an inert transport short-circuits that resolution.
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

/**
 * Service-role client — bypasses RLS by design. This is the only client
 * this service ever constructs: payment_providers, reserve_positions, and
 * compliance_checks carry no anon/authenticated RLS policy at all (Session
 * 38's migrations), so a service-role key is the only credential that can
 * read them. This service enforces its own read-only-for-CBS posture at
 * the route layer, not via RLS.
 */
export function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: NoopWebSocket as unknown as WebSocketLikeConstructor },
  });
}
