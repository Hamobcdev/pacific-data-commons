import { readFileSync } from "fs";
import { join } from "path";

type MessageKey = string; // dot-notation path e.g. "actions.saveReview.genericError"

const messageCache: Record<string, Record<string, unknown>> = {};

function loadMessages(locale: string): Record<string, unknown> {
  const cached = messageCache[locale];
  if (cached) return cached;
  const filePath = join(process.cwd(), "messages", `${locale}.json`);
  const content = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(content) as Record<string, unknown>;
  messageCache[locale] = parsed;
  return parsed;
}

function resolvePath(obj: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

/**
 * Server actions can't call next-intl's useTranslations()/getTranslations()
 * the way Server/Client Components do — there's no request-scoped React
 * context inside a "use server" function. This reads the same messages/*.json
 * files directly, keyed by dot-notation path, so server action error and
 * success strings live in one place instead of being hardcoded per action
 * (Session 6, Task 6). Locale is always "en" today — the app has no
 * request-locale routing wired up yet (Decision 9: English at launch, full
 * i18n stubs built in) — but every call site already threads a `locale`
 * parameter through so switching this on later is a one-line change per
 * call, not a rewrite.
 */
export function getServerMessage(key: MessageKey, locale = "en"): string {
  try {
    const messages = loadMessages(locale);
    return resolvePath(messages, key);
  } catch {
    // Fallback: return the key itself so nothing is silently empty.
    return key;
  }
}
