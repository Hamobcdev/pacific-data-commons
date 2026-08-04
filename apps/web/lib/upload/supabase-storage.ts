import { createServiceClient } from "@/lib/supabase/server";
import { PDC_UPLOADS_BUCKET } from "@/lib/upload/constants";

/**
 * Removes an uploaded file's object from Supabase Storage — called once
 * the AI formatting pipeline has finished with it (CLAUDE.md P1/P5: raw
 * uploads are temporary, deleted after processing + approval). Server-only
 * — uses the service-role client, same posture as every other privileged
 * Storage/DB write in this app (see actions/upload/delete-uploaded-file.ts,
 * the caller that also updates the `uploaded_files` row).
 */
export async function deleteUploadedObject(objectPath: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(PDC_UPLOADS_BUCKET).remove([objectPath]);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
