"use server";

import { sendResumeLink, type ResumeRequestResult } from "@/lib/onboarding/resume";
import { z } from "zod";

const emailSchema = z.string().email("Please enter a valid email address");

/** Server action behind the "send me a link to continue later" UI
 * (components/onboarding/ResumeLink.tsx). See lib/onboarding/resume.ts for
 * how the link is generated and later resolved back to a provider. */
export async function requestResume(email: string, redirectPath?: string): Promise<ResumeRequestResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Please enter a valid email address" };
  }
  return sendResumeLink(parsed.data, redirectPath);
}
