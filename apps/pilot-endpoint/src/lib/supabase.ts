import { createClient, type SupabaseClient, type WebSocketLike, type WebSocketLikeConstructor } from "@supabase/supabase-js";
import type { Env } from "../types/env.js";

/**
 * Identical NoopWebSocket workaround to apps/directory-api/src/lib/supabase.ts
 * — see that file's doc comment for the full root cause (Realtime's
 * constructor eagerly resolves a WebSocket implementation even though this
 * process never calls .channel()/.subscribe(), which crashes on Railway's
 * Node runtime without a native global WebSocket). Duplicated rather than
 * shared: this app has never imported anything from apps/directory-api, and
 * a two-line workaround isn't worth a new shared package.
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
 * Service-role client — this process is a trusted backend (it already holds
 * the endpoint's own payTo private-key-adjacent secrets), so it bypasses RLS
 * by design. Used only to log settled payments (transactionLogger.ts) and
 * resolve this deployment's provider/endpoint identity once at startup
 * (directoryContext.ts) — never to serve buyer-facing reads.
 */
export function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: NoopWebSocket as unknown as WebSocketLikeConstructor },
  });
}
