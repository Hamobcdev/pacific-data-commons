"use server";

import { randomUUID } from "node:crypto";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { createR2Client, getR2Bucket } from "@/lib/upload/r2";

const ACCEPTED_EXTENSIONS = ["pdf", "xlsx", "csv", "docx", "md", "zip"] as const;
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

export interface InitUploadResult {
  success: boolean;
  uploadId?: string;
  key?: string;
  error?: string;
}

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Starts a Cloudflare R2 (S3-compatible) multipart upload and returns the
 * uploadId + object key the browser needs to request per-part presigned
 * URLs from (see get-part-url.ts). Raw bytes never touch this server.
 */
export async function initUpload(params: {
  providerId: string;
  filename: string;
  fileSizeBytes: number;
}): Promise<InitUploadResult> {
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
  if (!params.providerId) {
    return { success: false, error: "Please complete registration before uploading files." };
  }

  const key = `uploads/${params.providerId}/${randomUUID()}-${params.filename}`;

  try {
    const client = createR2Client();
    const result = await client.send(
      new CreateMultipartUploadCommand({ Bucket: getR2Bucket(), Key: key, ContentType: "application/octet-stream" }),
    );
    if (!result.UploadId) {
      return { success: false, error: "Could not start the upload. Please try again." };
    }
    return { success: true, uploadId: result.UploadId, key };
  } catch {
    return { success: false, error: "Could not reach file storage. Please try again in a moment." };
  }
}
