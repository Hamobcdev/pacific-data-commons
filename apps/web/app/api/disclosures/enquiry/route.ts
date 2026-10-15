import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

// In-memory rate limiter — 3 submissions per IP per hour.
// Acceptable for this low-volume contact form; resets on process restart.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT = 3;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests — please try again later." },
      { status: 429 }
    );
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

  const { name, email, organisation, message } = body as Record<string, unknown>;

  // Validate required fields
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  // Length caps — 500 chars each per brief
  if (name.length > 500 || email.length > 500 || message.length > 500) {
    return NextResponse.json({ error: "Input exceeds maximum length." }, { status: 400 });
  }
  if (organisation !== undefined && typeof organisation === "string" && organisation.length > 500) {
    return NextResponse.json({ error: "Input exceeds maximum length." }, { status: 400 });
  }

  const to = process.env.RESEND_TO_EMAIL ?? "anthony@synergybcpacific.com";
  const orgLabel = typeof organisation === "string" && organisation.trim() ? organisation.trim() : "No org";

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Pacific Data Commons <noreply@synergybcpacific.com>",
      to,
      subject: `[PDC Enquiry] ${name.trim()} — ${orgLabel}`,
      text: [
        `Name: ${name.trim()}`,
        `Email: ${email.trim()}`,
        `Organisation: ${orgLabel}`,
        "",
        `Message:`,
        message.trim(),
      ].join("\n"),
    });
  } catch (err) {
    console.error("[disclosures/enquiry] Resend error:", err);
    // Still return success to user — email failure is an ops issue, not user error
    // Log is visible in Vercel function logs
  }

  return NextResponse.json({ success: true });
}
