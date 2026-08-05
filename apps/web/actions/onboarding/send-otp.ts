"use server";

import { sendResumeOtp, type ResumeRequestResult } from "@/lib/onboarding/resume";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const emailSchema = z.string().email("Please enter a valid email address");

/** Server action behind "Already registered? Continue where you left off"
 * (components/onboarding/ResumeOtp.tsx) — sends a 6-digit code (Session 10;
 * replaces the magic-link request-resume.ts). Rate limited per email (not
 * just per IP) — a code-send endpoint is exactly the kind of thing that
 * must not be usable to spam an institution's inbox. Returns
 * `resetInSeconds` when limited so the UI can show a live countdown instead
 * of a static "try again later" (Deliverable 3). */
export async function sendOtp(email: string): Promise<ResumeRequestResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Please enter a valid email address" };
  }

  const ip = await getClientIp();
  const emailLimit = checkRateLimit({ identifier: `resume-email:${parsed.data.toLowerCase()}`, maxRequests: 3, windowMs: 60 * 60 * 1000 });
  const ipLimit = checkRateLimit({ identifier: `resume-ip:${ip}`, maxRequests: 3, windowMs: 60 * 60 * 1000 });
  if (!emailLimit.allowed || !ipLimit.allowed) {
    const resetInSeconds = Math.max(emailLimit.resetInSeconds, ipLimit.resetInSeconds);
    return { success: false, message: "Too many code requests. Please try again later.", resetInSeconds };
  }

  return sendResumeOtp(parsed.data);
}
