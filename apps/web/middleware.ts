import createIntlMiddleware from "next-intl/middleware";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Session 10, Deliverable 4: refreshes the Supabase Auth session cookie on
 * ordinary navigation. Previously middleware.ts ran only next-intl's locale
 * routing — a doc comment elsewhere (actions/onboarding/resume-session.ts)
 * claimed middleware refreshed the session, which was never true. Onboarding
 * continuation itself never depended on this (it's gated by the separate
 * 72-hour onboarding_session_token, not the 1-hour Supabase Auth access
 * token), but the dashboard and any future page that relies on staying
 * authenticated across a longer session does depend on it now.
 *
 * getUser() (not getSession()) is deliberate — it re-validates the token
 * against Supabase Auth rather than trusting whatever is in the cookie,
 * triggering a silent refresh via the refresh token when the access token
 * has expired. Errors here are non-fatal: an unauthenticated visitor is the
 * overwhelmingly common case (every anonymous directory/search visit), and
 * this must never block or slow down that path.
 */
export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
