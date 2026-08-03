"use server";

import { CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { createR2Client, getR2Bucket } from "@/lib/upload/r2";
import { createServiceClient } from "@/lib/supabase/server";
import { validateOnboardingSession, InvalidOnboardingSessionError } from "@/lib/onboarding/session";
import type { UploadedFileType } from "@pdc/shared-types";

export interface CompleteUploadResult {
  success: boolean;
  uploadedFileId?: string;
  r2Key?: string;
  error?: string;
}

/**
 * Finalises a multipart upload (all parts already PUT directly to R2 from
 * the browser — see get-part-url.ts) and records the file in `uploaded_files`
 * so it's durable in Supabase (R4), not just localStorage.
 */
export async function completeUpload(params: {
  providerId: string;
  sessionToken: string;
  key: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
  filename: string;
  fileType: UploadedFileType;
  fileSizeBytes: number;
}): Promise<CompleteUploadResult> {
  try {
    await validateOnboardingSession(params.providerId, params.sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? err.message : "Invalid session." };
  }

  const client = createR2Client();

  try {
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: getR2Bucket(),
        Key: params.key,
        UploadId: params.uploadId,
        MultipartUpload: {
          Parts: params.parts
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  } catch {
    // Best-effort cleanup — an abandoned multipart upload otherwise sits in
    // R2 consuming storage until a lifecycle rule reaps it.
    await client
      .send(new AbortMultipartUploadCommand({ Bucket: getR2Bucket(), Key: params.key, UploadId: params.uploadId }))
      .catch(() => undefined);
    return { success: false, error: "Could not finish the upload. Please retry — already-uploaded parts are kept." };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("uploaded_files")
    .insert({
      provider_id: params.providerId,
      original_filename: params.filename,
      file_type: params.fileType,
      file_size_bytes: params.fileSizeBytes,
      r2_key: params.key,
      processing_status: "uploaded",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Upload finished but could not be recorded. Please contact SBP with your file name." };
  }

  return { success: true, uploadedFileId: data.id as string, r2Key: params.key };
}
