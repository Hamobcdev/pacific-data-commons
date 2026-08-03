import { defineRouting } from "next-intl/routing";

/**
 * Single source of truth for the app's locale list and routing behaviour
 * (Session 8.2). localePrefix: "always" — every locale, including the
 * default, gets a URL segment (/en/..., /sm/...). Requires every page to
 * live under app/[locale]/ (see that directory), because next-intl's
 * middleware always rewrites internally to a locale-prefixed path
 * regardless of prefix mode — "never" only hides the prefix from the
 * browser URL, it does not skip the internal rewrite, so a flat app/
 * structure 404s unconditionally no matter which localePrefix mode is
 * configured. Confirmed empirically: the previous "never" + flat app/
 * setup rewrote every request to /en/... internally and 404'd on all of
 * them (x-middleware-rewrite header present, no matching route).
 */
export const routing = defineRouting({
  locales: ["en", "sm", "fj", "to", "bi", "fr"],
  defaultLocale: "en",
  localePrefix: "always",
  localeDetection: false,
});
