import type { SupabaseClient } from "@supabase/supabase-js";
import type { PdcPaymentGate } from "@pdc/x402-adapter";
import type { Env } from "./lib/env.js";

/** Hono context bindings shared across the app — set once in index.ts. */
export interface AppVariables {
  supabase: SupabaseClient;
  env: Env;
  paymentGate: PdcPaymentGate;
}

export interface AppBindings {
  Variables: AppVariables;
}
