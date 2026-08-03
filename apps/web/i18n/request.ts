import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

function isSupportedLocale(value: string | undefined): value is (typeof routing.locales)[number] {
  return !!value && (routing.locales as readonly string[]).includes(value);
}

/**
 * Session 8.2 fix: previously destructured the deprecated `locale` param
 * (`async ({ locale }) => ...`). That getter runs next-intl's *legacy*
 * locale resolution, which calls Next's `notFound()` immediately if the
 * middleware-set locale header is missing from the request — no fallback
 * possible (see next-intl's RequestLocaleLegacy.js). `await requestLocale`
 * is the v3.22+ replacement: it resolves to `undefined` instead of hard
 * 404ing, so this can fall back to the default locale itself.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isSupportedLocale(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
