"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { validateOnboardingSession, InvalidOnboardingSessionError } from "@/lib/onboarding/session";
import { deleteUploadedObject } from "@/lib/upload/supabase-storage";

export interface DeleteUploadedFileResult {
  success: boolean;
  error?: string;
}

/**
 * Deletes an uploaded file's storage object and marks the `uploaded_files`
 * row deleted. CLAUDE.md P1/P5: raw uploads are temporary, deleted after
 * the AI formatting pipeline finishes with them + the provider approves
 * the output.
 *
 * Nothing in apps/web calls this automatically today — the AI formatting
 * pipeline is a separate Python service (CLAUDE.md Section 6, FastAPI +
 * Celery + Redis) that does not exist in this repo yet. This is the ready
 * integration point for that service (or a future scheduled job) to call
 * once it lands, not an end-to-end wired trigger.
 */
export async function deleteUploadedFile(providerId: string, sessionToken: string, uploadedFileId: string): Promise<DeleteUploadedFileResult> {
  try {
    await validateOnboardingSession(providerId, sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? err.message : "Invalid session." };
  }

  const supabase = createServiceClient();
  const { data: file, error: fetchError } = await supabase
    .from("uploaded_files")
    .select("storage_path, provider_id")
    .eq("id", uploadedFileId)
    .maybeSingle();

  if (fetchError || !file || file.provider_id !== providerId) {
    return { success: false, error: "File not found." };
  }

  const removal = await deleteUploadedObject(file.storage_path as string);
  if (!removal.success) {
    return { success: false, error: removal.error ?? "Could not delete the file from storage." };
  }

  const { error: updateError } = await supabase
    .from("uploaded_files")
    .update({ processing_status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", uploadedFileId);

  if (updateError) {
    return { success: false, error: "File was deleted from storage but the record could not be updated." };
  }

  return { success: true };
}
