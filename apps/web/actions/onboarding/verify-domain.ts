"use server";

export interface DomainCheckResult {
  verified: boolean;
  message: string;
  /** True if the check failed/was inconclusive but the provider can still
   * proceed — a failed domain check never blocks registration (R5). */
  manualReviewPath: boolean;
}

interface DnsOverHttpsResponse {
  Answer?: Array<{ name: string; type: number; data: string }>;
}

/**
 * Checks for an MX record on the given domain via Google's public
 * DNS-over-HTTPS API (no DNS SDK needed). Used for real-time feedback in
 * Step 1 — never blocking; a failed/unreachable check just routes to
 * manual review instead of failing the form.
 */
export async function verifyDomain(domain: string): Promise<DomainCheckResult> {
  try {
    const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { Accept: "application/dns-json" },
    });

    if (!response.ok) {
      return { verified: false, message: "Could not check domain — will be verified manually", manualReviewPath: true };
    }

    const data = (await response.json()) as DnsOverHttpsResponse;
    const hasMX = Boolean(data.Answer && data.Answer.length > 0);

    if (hasMX) {
      return { verified: true, message: "Domain verified", manualReviewPath: false };
    }

    return {
      verified: false,
      message: "No email records found for this domain. Your registration will be reviewed manually — this does not block your application.",
      manualReviewPath: true,
    };
  } catch {
    return { verified: false, message: "Domain check unavailable — will be verified manually", manualReviewPath: true };
  }
}
