import { Resend } from "resend";
import { logger } from "./logger.js";
import type { Env } from "./env.js";

/**
 * Provider notification email (Session 17, Decision 50) — this repo's first
 * real Resend integration. CLAUDE.md Section 26.4 confirmed no SMTP/Resend
 * provider has ever been wired up anywhere in the codebase before now.
 *
 * RESEND_API_KEY is optional (see env.ts): a missing key degrades to a
 * logged warning and a skipped send, the same "third-party outage/misconfig
 * must not break the caller" pattern apps/pilot-endpoint already uses for a
 * facilitator outage at boot (checkFacilitatorHealth). An integrity flag is
 * still recorded and visible on the provider dashboard even if the email
 * never goes out.
 */
let cachedClient: Resend | undefined;

function getClient(apiKey: string): Resend {
  cachedClient ??= new Resend(apiKey);
  return cachedClient;
}

export interface IntegrityFlagEmailParams {
  providerEmail: string;
  endpointTitle: string;
  expectedHash: string | null;
  actualHash: string | null;
}

function truncateHash(hash: string | null): string {
  if (!hash) return "(none)";
  return `${hash.slice(0, 16)}...`;
}

/**
 * Sends the 3-consecutive-fail integrity flag notification (Decision 50).
 * Never throws — a send failure is logged and swallowed so it can never
 * fail the /internal/integrity-event request that triggered it.
 */
export async function sendIntegrityFlagEmail(env: Env, params: IntegrityFlagEmailParams): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.warn("integrity_flag_email_skipped_no_provider", {
      reason: "RESEND_API_KEY not configured — see CLAUDE.md Section 26.4",
      providerEmail: params.providerEmail,
      endpointTitle: params.endpointTitle,
    });
    return;
  }

  try {
    const resend = getClient(env.RESEND_API_KEY);
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: params.providerEmail,
      subject: `Data integrity alert — ${params.endpointTitle}`,
      text: [
        `Your endpoint ${params.endpointTitle} has returned a data hash that does not match its`,
        `certified hash on 3 consecutive checks.`,
        ``,
        `Certified hash: ${truncateHash(params.expectedHash)}`,
        `Current hash:   ${truncateHash(params.actualHash)}`,
        ``,
        `If you updated your data intentionally, please re-certify via the PDC`,
        `dashboard. If you did not make changes, check your endpoint immediately.`,
        ``,
        `Your endpoint remains active but buyers will see an integrity warning`,
        `until the flag is resolved.`,
        ``,
        `Contact anthony@synergybcpacific.com for assistance.`,
      ].join("\n"),
    });
  } catch (err) {
    logger.error("integrity_flag_email_send_failed", {
      providerEmail: params.providerEmail,
      endpointTitle: params.endpointTitle,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
