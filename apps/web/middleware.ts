import createMiddleware from "next-intl/middleware";

/**
 * localePrefix: "never" — the given route structure has no `[locale]`
 * segment anywhere (app/onboarding/register/page.tsx, not
 * app/[locale]/onboarding/register/page.tsx). Without this, next-intl's
 * default prefixed routing would try to rewrite "/" to "/en" and 404 since
 * no app/[locale] directory exists. This mode negotiates locale via a
 * NEXT_LOCALE cookie instead of the URL path — matches "Always default to
 * English unless explicitly switched" and keeps every route exactly where
 * the file structure puts it.
 */
export default createMiddleware({
  locales: ["en", "sm", "fj", "to", "bi", "fr"],
  defaultLocale: "en",
  localeDetection: false,
  localePrefix: "never",
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
