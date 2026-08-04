"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { validateOnboardingSession, InvalidOnboardingSessionError } from "@/lib/onboarding/session";
import type { UploadedFileType } from "@pdc/shared-types";

export interface CompleteUploadResult {
  success: boolean;
  uploadedFileId?: string;
  storagePath?: string;
  error?: string;
}

/**
 * Records a file that has already finished uploading to Supabase Storage
 * (the browser's TUS client — lib/upload/chunked.ts — talks to Supabase
 * directly; this server never sees the bytes) into `uploaded_files`, so
 * it's durable in Supabase (R4) rather than only localStorage.
 */
export async function completeUpload(params: {
  providerId: string;
  sessionToken: string;
  objectPath: string;
  filename: string;
  fileType: UploadedFileType;
  fileSizeBytes: number;
}): Promise<CompleteUploadResult> {
  try {
    await validateOnboardingSession(params.providerId, params.sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? err.message : "Invalid session." };
  }

  // Defence in depth: the anon-key TUS upload isn't scoped to a single
  // object path by RLS (see session10_1_supabase_storage.sql for why) — so
  // refuse to create a durable record for anything outside the caller's
  // own provider prefix, even though init-upload.ts only ever hands out
  // paths under that prefix in the first place.
  if (!params.objectPath.startsWith(`${params.providerId}/`)) {
    return { success: false, error: "Upload path does not match your provider account." };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("uploaded_files")
    .insert({
      provider_id: params.providerId,
      original_filename: params.filename,
      file_type: params.fileType,
      file_size_bytes: params.fileSizeBytes,
      storage_path: params.objectPath,
      processing_status: "uploaded",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Upload finished but could not be recorded. Please contact SBP with your file name." };
  }

  return { success: true, uploadedFileId: data.id as string, storagePath: params.objectPath };
}
