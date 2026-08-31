import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./lib/env.js";

/** Hono context bindings shared across the app — set once in index.ts. */
export interface AppVariables {
  supabase: SupabaseClient;
  env: Env;
}

export interface AppBindings {
  Variables: AppVariables;
}
