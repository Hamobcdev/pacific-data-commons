import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { sendDisclosuresEnquiry } from "@/lib/email/resend";

/**
 * Disclosures page lead-capture form. Public, unauthenticated endpoint —
 * same rate-limit posture as /api/assistant (checkRateLimit/getClientIp)
 * since this is the first line of defence against spam on a form anyone
 * can reach with no account.
 *
 * No Supabase write: the email IS the enquiry record. See
 * lib/email/resend.ts's sendDisclosuresEnquiry doc comment for why its
 * failure must propagate into this response rather than being swallowed
 * like the deployment-flow email sends are.
 */

const RATE_LIMIT_MAX_REQUESTS = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const MAX_FIELD_LENGTH = 500;

const RESEND_TO_EMAIL = process.env.RESEND_TO_EMAIL ?? "anthony@synergybcpacific.com";

interface DisclosuresEnquiryBody {
  name?: string;
  email?: string;
  organisation?: string;
  message?: string;
}

function isValidEmail(value: string): boolean {
  // Deliberately permissive — this gates obvious junk, not RFC 5322
  // conformance. Resend itself will reject a malformed address.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = await getClientIp();
  const rateLimit = checkRateLimit({
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
    identifier: ip,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many enquiries — please wait a while before trying again." },
      { status: 429, headers: { "Retry-After": String(rateLimit.resetInSeconds) } },
    );
  }

  const body = (await request.json().catch(() => undefined)) as DisclosuresEnquiryBody | undefined;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const organisation = typeof body?.organisation === "string" ? body.organisation.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  const requiredFields = { name, email, message };
  for (const [field, value] of Object.entries(requiredFields)) {
    if (value.length === 0 || value.length > MAX_FIELD_LENGTH) {
      return NextResponse.json(
        { error: "invalid_request", message: `${field} is required and must be ${MAX_FIELD_LENGTH} characters or fewer.` },
        { status: 400 },
      );
    }
  }
  if (organisation.length > MAX_FIELD_LENGTH) {
    return NextResponse.json(
      { error: "invalid_request", message: `organisation must be ${MAX_FIELD_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_request", message: "email must be a valid email address." }, { status: 400 });
  }

  const sent = await sendDisclosuresEnquiry({ to: RESEND_TO_EMAIL, name, email, organisation, message });
  if (!sent) {
    return NextResponse.json(
      { error: "email_send_failed", message: "Your enquiry could not be sent right now. Please email anthony@synergybcpacific.com directly." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
