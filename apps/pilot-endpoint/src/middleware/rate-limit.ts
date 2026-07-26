import type { MiddlewareHandler } from "hono";

interface Bucket {
  count: number;
  windowStartedAt: number;
}

/**
 * In-memory fixed-window limiter, keyed by client IP — same pattern as
 * apps/directory-api/src/middleware/rateLimit.ts. Sufficient for a
 * single-instance Railway deployment; move to a shared store (Redis) if this
 * endpoint is ever scaled to multiple instances.
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
