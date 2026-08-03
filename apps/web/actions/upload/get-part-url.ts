"use server";

import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, getR2Bucket } from "@/lib/upload/r2";
import { validateOnboardingSession, InvalidOnboardingSessionError } from "@/lib/onboarding/session";

const PART_URL_EXPIRY_SECONDS = 15 * 60;

export interface GetPartUrlResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Returns a short-lived presigned PUT URL for one part of an in-progress
 * multipart upload (see init-upload.ts). Called once per chunk from
 * lib/upload/chunked.ts — the browser PUTs the chunk straight to R2 with
 * this URL, this server never sees the bytes.
 */
export async function getPartUploadUrl(params: {
  providerId: string;
  sessionToken: string;
  key: string;
  uploadId: string;
  partNumber: number;
}): Promise<GetPartUrlResult> {
  try {
    await validateOnboardingSession(params.providerId, params.sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? err.message : "Invalid session." };
  }

  try {
    const client = createR2Client();
    const command = new UploadPartCommand({
      Bucket: getR2Bucket(),
      Key: params.key,
      UploadId: params.uploadId,
      PartNumber: params.partNumber,
    });
    const url = await getSignedUrl(client, command, { expiresIn: PART_URL_EXPIRY_SECONDS });
    return { success: true, url };
  } catch {
    return { success: false, error: "Could not get an upload URL for this part. Retrying may help." };
  }
}
