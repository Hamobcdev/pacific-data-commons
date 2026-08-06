"use server";

import { getLocale } from "next-intl/server";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";

/**
 * First sign-out implementation (Session 12) — clears the Supabase Auth
 * session cookie via the cookie-aware server client (lib/supabase/server.ts),
 * same client getResumedProvider() reads from. Bound to a <form action={signOut}>
 * in GlobalNav so it works without client JS. getLocale() (not a hardcoded
 * "en") keeps a provider on a non-English locale route from being bounced
 * to /en/ on sign-out.
 */
export async function signOut(): Promise<void> {
  const supabase = createServerClient();
  await supabase.auth.signOut();
  const locale = await getLocale();
  redirect({ href: "/", locale });
}
