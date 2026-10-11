import type { SupabaseClient } from "@supabase/supabase-js";
import type { PdcPaymentGate } from "@pdc/x402-adapter";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { Env } from "./lib/env.js";

/** Hono context bindings shared across the app — set once in index.ts. */
export interface AppVariables {
  supabase: SupabaseClient;
  env: Env;
  paymentGate: PdcPaymentGate;
  // Only present on Cloudflare Workers (worker.ts passes the real
  // CRYPTO_PRICES_KV binding through to createApp()) — undefined on Node
  // local dev (index.ts has no Workers bindings to pass). Routes/services
  // that read it must treat "undefined" as "no KV available" and fall
  // through to their existing non-KV behaviour, not throw.
  cryptoPricesKv?: KVNamespace;
  /** Set by middleware/agentWalletAuth.ts's requireKnownAgentWallet — only present on routes behind that middleware (the Agent Dataset Gateway's query adapter). */
  agentWallet?: string;
}

export interface AppBindings {
  Variables: AppVariables;
}
