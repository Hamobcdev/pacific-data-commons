interface Bucket {
  count: number;
  windowStartedAt: number;
}

/**
 * In-memory fixed-window limiter keyed by user wallet, not client IP —
 * Deliverable 6 requires "10 requests per minute per user wallet" (agents
 * are compute- and Claude-API-cost-intensive per run, unlike the free
 * IP-keyed limiters on apps/pilot-endpoint / apps/directory-api). Keying by
 * wallet needs the request body already parsed, so this is a plain class
 * called from inside each route handler rather than Hono middleware, which
 * only sees the request before the body is read.
 *
 * Sufficient for a single-instance Railway deployment; move to a shared
 * store (Redis) if this service is ever scaled to multiple instances.
 */
export class WalletRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  check(wallet: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const now = Date.now();
    const bucket = this.buckets.get(wallet);

    if (!bucket || now - bucket.windowStartedAt >= this.windowMs) {
      this.buckets.set(wallet, { count: 1, windowStartedAt: now });
      return { allowed: true };
    }

    if (bucket.count >= this.max) {
      return { allowed: false, retryAfterSeconds: Math.ceil((bucket.windowStartedAt + this.windowMs - now) / 1000) };
    }

    bucket.count += 1;
    return { allowed: true };
  }
}
