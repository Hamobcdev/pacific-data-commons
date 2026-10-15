import { NextRequest, NextResponse } from "next/server";

/**
 * Step 2 of the human payment rail: a thin proxy to apps/directory-api's
 * POST /payment/verify. Deliberately does no verification itself — the
 * Worker is the one with Algorand indexer access and the AVM_ADDRESS /
 * ALGORAND_INDEXER_URL it needs to check the submitted tx id against,
 * plus the payment_intents row it updates and the email it sends on
 * success. This route exists only so the browser never needs to know the
 * Worker's own base URL/shape beyond what NEXT_PUBLIC_DIRECTORY_API_URL
 * already exposes, and so a future server-only check (rate limiting,
 * logging) has a natural home on this side without touching the Worker.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { referenceId, algoTxId } = body as Record<string, unknown>;
  if (typeof referenceId !== "string" || referenceId.trim().length === 0) {
    return NextResponse.json({ error: "referenceId is required." }, { status: 400 });
  }
  if (typeof algoTxId !== "string" || algoTxId.trim().length === 0) {
    return NextResponse.json({ error: "algoTxId is required." }, { status: 400 });
  }

  const directoryApiUrl = (process.env.NEXT_PUBLIC_DIRECTORY_API_URL ?? "https://api.synergybcpacific.com").replace(/\/$/, "");

  let workerRes: Response;
  try {
    workerRes = await fetch(`${directoryApiUrl}/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referenceId: referenceId.trim(), algoTxId: algoTxId.trim() }),
    });
  } catch (err) {
    console.error("[payment/confirm] Worker request failed:", err);
    return NextResponse.json({ error: "Could not reach the verification service — please try again." }, { status: 502 });
  }

  const data = await workerRes.json().catch(() => ({ error: "Verification service returned an invalid response." }));
  return NextResponse.json(data, { status: workerRes.status });
}
