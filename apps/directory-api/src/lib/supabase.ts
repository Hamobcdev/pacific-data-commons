import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env.js";

/**
 * Server-side client using the service role key — this process is a trusted
 * backend, so it bypasses RLS by design and is responsible for enforcing
 * PDC-layer visibility rules itself (see services/searchService.ts). The
 * anon-key RLS policies in the Session 1 migration remain the backstop for
 * any direct client access to Supabase; they are not relied on here.
 */
export function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
