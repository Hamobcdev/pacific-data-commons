import type { MiddlewareHandler } from "hono";

interface Bucket {
  count: number;
  windowStartedAt: number;
}

/**
 * In-memory fixed-window limiter, keyed by client IP. Sufficient for a
 * single-instance Railway deployment during the POC (CLAUDE.md Section 4:
 * Directory API runs as one Railway service). If the directory API is ever
 * scaled to multiple instances, this must move to a shared store (Redis) —
 * flag that before doing so, per CLAUDE.md Section 18.
 */
export function rateLimit(options: { windowMs: number; max: number }): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();

  return async (c, next) => {
    const key =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStartedAt >= options.windowMs) {
      buckets.set(key, { count: 1, windowStartedAt: now });
      await next();
      return;
    }

    if (bucket.count >= options.max) {
      const retryAfterSeconds = Math.ceil((bucket.windowStartedAt + options.windowMs - now) / 1000);
      c.header("Retry-After", String(retryAfterSeconds));
      return c.json(
        { error: "rate_limited", message: "Too many requests. Please slow down." },
        429,
      );
    }

    bucket.count += 1;
    await next();
  };
}
