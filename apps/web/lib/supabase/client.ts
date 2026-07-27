import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — anon key only (R2). RLS-enforced. Used for
 * reading the current Supabase Auth session (magic-link resume) client-side;
 * writes to provider data go through server actions using the service key
 * instead, never straight from the browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
