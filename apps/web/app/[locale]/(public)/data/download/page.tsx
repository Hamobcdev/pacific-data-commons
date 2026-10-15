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

  // One-time: mark redeemed before fetching the actual data, not after —
  // a crash/timeout on the data fetch below must not leave a reusable
  // token behind. A buyer who hits a transient failure here has their
  // reference ID and tx ID as the recovery path (contact support), same
  // posture as the "payment verified but token not issued" case in
  // apps/directory-api/src/routes/payment.ts.
  await supabase
    .from("payment_intents")
    .update({ state: "token_redeemed", token_redeemed_at: new Date().toISOString() })
    .eq("id", intent.id);

  const directoryApiUrl = (process.env.NEXT_PUBLIC_DIRECTORY_API_URL ?? "https://api.synergybcpacific.com").replace(/\/$/, "");
  const internalKey = process.env.DASHBOARD_INTERNAL_KEY;

  let data: unknown = null;
  let fetchFailed = false;
  if (!internalKey) {
    fetchFailed = true;
  } else {
    try {
      const res = await fetch(`${directoryApiUrl}/internal/data${intent.tier_path}`, {
        headers: { "X-Internal-Key": internalKey },
        cache: "no-store",
      });
      if (!res.ok) {
        fetchFailed = true;
      } else {
        data = await res.json();
      }
    } catch {
      fetchFailed = true;
    }
  }

  if (fetchFailed) {
    return (
      <ErrorShell message="Your payment was verified, but we couldn't retrieve your data just now. Contact anthony@synergybcpacific.com with this reference ID for help:">
        <p className="mt-2 font-mono text-sm text-gray-700">{intent.reference_id}</p>
      </ErrorShell>
    );
  }

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
