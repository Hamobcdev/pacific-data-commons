import { createClient, type SupabaseClient, type WebSocketLike, type WebSocketLikeConstructor } from "@supabase/supabase-js";
import type { Env } from "./env.js";

/**
 * Satisfies @supabase/realtime-js's WebSocketLikeConstructor shape without
 * ever actually opening a socket — see the comment on createSupabaseClient
 * below for why this exists. Every member is a no-op / inert default
 * because RealtimeClient's constructor only needs `transport` to be
 * *present*; this app never calls .connect() (no .channel()/.subscribe()
 * anywhere in this service), so the class is never instantiated.
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
 * Server-side client using the service role key — this process is a trusted
 * backend, so it bypasses RLS by design and is responsible for enforcing
 * PDC-layer visibility rules itself (see services/searchService.ts). The
 * anon-key RLS policies in the Session 1 migration remain the backstop for
 * any direct client access to Supabase; they are not relied on here.
 *
 * `realtime.transport` — this service only ever does plain database
 * queries, never realtime subscriptions, but @supabase/supabase-js's
 * SupabaseClient constructor unconditionally constructs a RealtimeClient
 * regardless (SupabaseClient.ts's constructor calls _initRealtimeClient()
 * every time, whether or not you ever touch .realtime). RealtimeClient's
 * constructor in turn eagerly calls WebSocketFactory.getWebSocketConstructor()
 * to resolve `transport` — which throws immediately, at createClient() time
 * rather than at first use, on any Node runtime without a native global
 * WebSocket (stable only from Node 22; Railway's build/runtime here has run
 * on Node 20 in the past, per this repo's `engines.node: ">=20"`). That is
 * the actual cause of the "WebSocketFactory.getWebSocketConstructor" crash
 * on Railway.
 *
 * NOTE: a previously-tried fix of passing `realtime.params.eventsPerSecond`
 * does NOT address this — that field isn't even part of
 * RealtimeClientOptions in the installed @supabase/realtime-js version
 * (2.110.x); it's a channel-join parameter with no effect on whether or
 * when WebSocketFactory resolution runs. The actual fix is to supply
 * `transport` directly, which short-circuits that resolution entirely
 * (`options?.transport ?? WebSocketFactory.getWebSocketConstructor()` in
 * RealtimeClient's `_initializeOptions`). NoopWebSocket above is that
 * supplied transport — inert because it's never actually invoked.
 */
export function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // TS can't express a static index signature on a class declaration
    // (WebSocketLikeConstructor requires `[key: string]: any` on the
    // constructor side); the runtime shape above is fully compatible.
    realtime: { transport: NoopWebSocket as unknown as WebSocketLikeConstructor },
  });
}
