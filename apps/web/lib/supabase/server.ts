import { createServerClient as createSsrServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Cookie-aware server client — anon key, RLS-enforced. Reads/writes the
 * Supabase Auth session cookie, so this is how a server action or Server
 * Component finds out "which provider is resuming via magic link right
 * now" (see lib/onboarding/resume.ts). Must be called inside a request
 * (Server Component, Server Action, or Route Handler) — `cookies()` throws
 * outside one.
 */
export function createServerClient() {
  const cookieStore = cookies();
  return createSsrServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component (not a Server Action/Route
          // Handler) — cookies() is read-only there. Middleware refreshes
          // the session on navigation instead, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Service-role client — bypasses RLS (R2: server actions and API routes
 * only, SUPABASE_SERVICE_KEY never reaches the browser). This is what
 * writes provider/endpoint/uploaded_files rows — it has no notion of "the
 * current user," it's a trusted backend credential, same pattern as
 * apps/directory-api/src/lib/supabase.ts.
 */
export function createServiceClient() {
  return createSupabaseJsClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
