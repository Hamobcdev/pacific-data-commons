"use server";

import { validateOnboardingSession, InvalidOnboardingSessionError } from "@/lib/onboarding/session";
import { PDC_UPLOADS_BUCKET } from "@/lib/upload/constants";

const ACCEPTED_EXTENSIONS = ["pdf", "xlsx", "csv", "docx", "md", "zip"] as const;
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

export interface InitUploadResult {
  success: boolean;
  objectPath?: string;
  bucket?: string;
  error?: string;
}

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Validates the file and hands back the Supabase Storage object path the
 * browser's resumable (TUS) upload client should use — see
 * lib/upload/chunked.ts. No bytes touch this server: the browser talks to
 * Supabase Storage's TUS endpoint directly with the public anon key, the
 * same "never proxy raw bytes through the app server" posture the previous
 * R2 presigned-URL flow had.
 */
export async function initUpload(params: {
  providerId: string;
  sessionToken: string;
  filename: string;
  fileSizeBytes: number;
}): Promise<InitUploadResult> {
  try {
    await validateOnboardingSession(params.providerId, params.sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? err.message : "Invalid session." };
  }

  const ext = extensionOf(params.filename);
  if (!ACCEPTED_EXTENSIONS.includes(ext as (typeof ACCEPTED_EXTENSIONS)[number])) {
    return {
      success: false,
      error: `"${ext || "unknown"}" is not an accepted file type. Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
    };
  }
  if (params.fileSizeBytes <= 0 || params.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return { success: false, error: "Files must be under 500MB." };
  }

  return { success: true, objectPath: `${params.providerId}/${params.filename}`, bucket: PDC_UPLOADS_BUCKET };
}
