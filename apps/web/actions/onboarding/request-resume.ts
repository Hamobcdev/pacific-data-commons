"use server";

import { sendResumeLink, type ResumeRequestResult } from "@/lib/onboarding/resume";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const emailSchema = z.string().email("Please enter a valid email address");

/** Server action behind the "send me a link to continue later" UI
 * (components/onboarding/ResumeLink.tsx). See lib/onboarding/resume.ts for
 * how the link is generated and later resolved back to a provider. Rate
 * limited per email (not just per IP) — magic-link emails are the resume
 * path this session's C1 fix relies on, so it must not be usable to spam an
 * institution's inbox. */
export async function requestResume(email: string, redirectPath?: string): Promise<ResumeRequestResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Please enter a valid email address" };
  }

  const ip = await getClientIp();
  const emailLimit = checkRateLimit({ identifier: `resume-email:${parsed.data.toLowerCase()}`, maxRequests: 3, windowMs: 60 * 60 * 1000 });
  const ipLimit = checkRateLimit({ identifier: `resume-ip:${ip}`, maxRequests: 3, windowMs: 60 * 60 * 1000 });
  if (!emailLimit.allowed || !ipLimit.allowed) {
    return { success: false, message: "Too many resume link requests. Please try again in an hour." };
  }

  return sendResumeLink(parsed.data, redirectPath);
}
