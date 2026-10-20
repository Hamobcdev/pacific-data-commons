import { NextRequest, NextResponse } from "next/server";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

interface Bucket {
  count: number;
  windowStartedAt: number;
}

/**
 * Best-effort in-memory per-IP limiter — no equivalent exists elsewhere in
 * apps/web's payment routes (intent/confirm have none). Same "single
 * instance" caveat as apps/directory-api/src/middleware/rateLimit.ts's own
 * doc comment: this Map resets on cold start and isn't shared across
 * serverless instances, so it's a soft backstop, not the real control —
 * the real one is apps/directory-api's own route-level rate limit on
 * POST /payment/search (10/min/IP, see routes/payment.ts), which this
 * route proxies to and which runs in a single Worker regardless of how
 * many Next.js instances are handling requests here.
 */
const buckets = new Map<string, Bucket>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStartedAt >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStartedAt: now });
    return false;
  }
  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  bucket.count += 1;
  return false;
}

/**
 * Step 2b of the human payment rail (feature/payment-modal-auto-txid): a
 * thin proxy to apps/directory-api's POST /payment/search, mirroring
 * apps/web/app/api/payment/confirm/route.ts's own proxy pattern exactly.
 * Does no verification, no Supabase access, and no email itself — the
 * Worker owns all of that (same division of responsibility as /confirm).
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { referenceId } = body as Record<string, unknown>;
  if (typeof referenceId !== "string" || referenceId.trim().length === 0) {
    return NextResponse.json({ error: "referenceId is required." }, { status: 400 });
  }

  const directoryApiUrl = (process.env.NEXT_PUBLIC_DIRECTORY_API_URL ?? "https://api.synergybcpacific.com").replace(/\/$/, "");

  let workerRes: Response;
  try {
    workerRes = await fetch(`${directoryApiUrl}/payment/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referenceId: referenceId.trim() }),
    });
  } catch (err) {
    console.error("[payment/search] Worker request failed:", err);
    return NextResponse.json({ error: "Could not reach the verification service — please try again." }, { status: 502 });
  }

  const data = await workerRes.json().catch(() => ({ error: "Verification service returned an invalid response." }));
  return NextResponse.json(data, { status: workerRes.status });
}
