/**
 * In-memory sliding-window rate limiter for server actions.
 *
 * In production this should move to Redis (Upstash or similar) for
 * persistence across serverless function instances. For the POC, in-memory
 * is sufficient — the competition pilot runs a single Railway instance.
 * Flag for Session 10: migrate to Redis before public launch.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  identifier: string; // e.g. IP address or email
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export function checkRateLimit(config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const key = config.identifier;
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > config.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: new Date(now + config.windowMs) };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: new Date(entry.windowStart + config.windowMs) };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: new Date(entry.windowStart + config.windowMs) };
}

/**
 * Resolves the caller's IP from Railway's forwarded headers. Falls back to
 * "unknown" (a shared bucket) rather than throwing — a missing header
 * degrades rate limiting for that request, it must never block it.
 */
export async function getClientIp(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = headers();
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) return (forwardedFor.split(",")[0] ?? "unknown").trim();
  return h.get("x-real-ip") ?? "unknown";
}
