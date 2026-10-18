import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PrintButton } from "./PrintButton";
import { DataRenderer, humanizeSlug } from "./DataRenderer";

/**
 * Step 3 of the human payment rail (competition, simplified flow) —
 * token-gated, human-readable data delivery. Standalone: no GlobalNav /
 * GlobalFooter / side panels, and no links back into the rest of the
 * site (per build brief — this is a one-time delivery experience, not a
 * page a buyer is meant to keep browsing from).
 *
 * Deliberately a plain async Server Component with no "use client" —
 * see the disclosures-page incident this same codebase hit (CLAUDE.md's
 * payment-rail session history): a Server Component that needs a
 * service-role Supabase client and a server-only fetch to the Worker's
 * internal route has no business being a Client Component at all, and
 * PrintButton (the one genuinely interactive element) is split out into
 * its own tiny Client Component instead of pulling the whole page over.
 */
export default async function DownloadPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;

  if (!token) {
    return <ErrorShell message="Invalid or missing download link." />;
  }

  const supabase = createServiceClient();
  const { data: intent, error } = await supabase.from("payment_intents").select("*").eq("download_token", token).maybeSingle();

  if (error || !intent || intent.state !== "token_issued") {
    return <ErrorShell message="This link is invalid, has already been used, or has expired." />;
  }
  if (intent.token_redeemed_at) {
    return <ErrorShell message="This download link has already been used." />;
  }
  if (new Date(intent.expires_at).getTime() < Date.now()) {
    return <ErrorShell message="This download link has expired." />;
  }

  // Reordered (fix/email-persistence-and-download-page, 2026-10-16): this
  // used to mark the token redeemed BEFORE attempting the fetch below, on
  // the theory that a crash/timeout must never leave a reusable token
  // behind. In production that backfired the other way: a real buyer's
  // row (PDC-ca6719f4-...) got burned to token_redeemed on a fetch that
  // never actually delivered any data, permanently locking them out with
  // no automated retry — the "contact support" fallback this comment used
  // to cite requires a human to manually dig through payment_intents, not
  // something a buyer can self-serve. Now the token is only consumed on a
  // CONFIRMED successful fetch, so a transient failure (misconfigured
  // DASHBOARD_INTERNAL_KEY, a cold Worker, a network blip) just leaves the
  // link reloadable — the fetch is naturally idempotent (GET against a
  // static/in-memory dataset), so retrying has no side effect worth
  // guarding against.
  const directoryApiUrl = (process.env.NEXT_PUBLIC_DIRECTORY_API_URL ?? "https://api.synergybcpacific.com").replace(/\/$/, "");
  const internalKey = process.env.DASHBOARD_INTERNAL_KEY;

  let data: unknown = null;
  let fetchFailed = false;
  if (!internalKey) {
    // Distinguished from the other two failure branches below — this one
    // means apps/web's own DASHBOARD_INTERNAL_KEY env var isn't set in
    // *this* deployment target at all (e.g. present for Production but not
    // Preview), not a Worker-side problem. The prior version of this page
    // folded all three cases into one silent boolean, which is exactly why
    // diagnosing PDC-ca6719f4-... required manually querying Supabase and
    // tailing the Worker instead of reading a log line.
    console.error("[data/download] DASHBOARD_INTERNAL_KEY not configured for this deployment", {
      referenceId: intent.reference_id,
    });
    fetchFailed = true;
  } else {
    try {
      const res = await fetch(`${directoryApiUrl}/internal/data${intent.tier_path}`, {
        headers: { "X-Internal-Key": internalKey },
        cache: "no-store",
      });
      if (!res.ok) {
        console.error("[data/download] internal data fetch returned non-OK status", {
          referenceId: intent.reference_id,
          tierPath: intent.tier_path,
          status: res.status,
        });
        fetchFailed = true;
      } else {
        data = await res.json();
      }
    } catch (err) {
      console.error("[data/download] internal data fetch threw", {
        referenceId: intent.reference_id,
        tierPath: intent.tier_path,
        error: err instanceof Error ? err.message : String(err),
      });
      fetchFailed = true;
    }
  }

  if (fetchFailed) {
    return (
      <ErrorShell message="Your payment was verified, but we couldn't retrieve your data just now. Reload this page to try again, or contact anthony@synergybcpacific.com with this reference ID for help:">
        <p className="mt-2 font-mono text-sm text-gray-700">{intent.reference_id}</p>
      </ErrorShell>
    );
  }

  // Only now — after a confirmed successful fetch — is the token actually
  // consumed. See the comment above this block for why this moved from
  // before the fetch to after it.
  //
  // redeemed_at/redeemed_ip/redeemed_user_agent (migration
  // 20261018000001, not yet applied) are bundled into this same update
  // call rather than a second round trip. If those columns don't exist
  // yet, PostgREST rejects the whole request (unrecognised column), so
  // this update — including the state/token_redeemed_at transition above
  // — fails as a unit until the migration is applied. That failure is
  // not checked/thrown here (same as before this change), so it never
  // blocks the render below, but note it means the token-consumption
  // write silently no-ops until the migration lands.
  const requestHeaders = headers();
  await supabase
    .from("payment_intents")
    .update({
      state: "token_redeemed",
      token_redeemed_at: new Date().toISOString(),
      redeemed_at: new Date().toISOString(),
      redeemed_ip: requestHeaders.get("x-forwarded-for") ?? requestHeaders.get("cf-connecting-ip") ?? null,
      redeemed_user_agent: requestHeaders.get("user-agent") ?? null,
    })
    .eq("id", intent.id);

  const endpointName = humanizeSlug(intent.tier_path);
  const fetchedAt = isPlainObjectWithFetchedAt(data) ? data.fetched_at : null;

  return (
    <div className="min-h-screen bg-white">
      <style>{`@media print { .print\\:hidden { display: none !important; } }`}</style>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-4 mb-6 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-navy">{endpointName}</h1>
            <p className="mt-1 text-sm text-green-700 font-medium">✓ Verified payment · Algorand blockchain</p>
            {fetchedAt && <p className="mt-0.5 text-xs text-gray-500">Fetched {new Date(fetchedAt).toLocaleString()}</p>}
          </div>
          <PrintButton />
        </div>

        <DataRenderer tierPath={intent.tier_path} data={data} />
      </div>
    </div>
  );
}

function isPlainObjectWithFetchedAt(value: unknown): value is { fetched_at: string } {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).fetched_at === "string";
}

function ErrorShell({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Download link</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="warning">{message}</Alert>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
