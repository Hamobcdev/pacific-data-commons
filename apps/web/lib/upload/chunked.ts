import * as tus from "tus-js-client";
import type { UploadedFileType } from "@pdc/shared-types";
import { initUpload } from "@/actions/upload/init-upload";
import { completeUpload } from "@/actions/upload/complete-upload";
import { PDC_UPLOADS_BUCKET } from "@/lib/upload/constants";

/**
 * Supabase's documented chunk size for its resumable (TUS) upload endpoint.
 * Larger than the old R2 5MB minimum, but TUS has no such floor — this is
 * just what Supabase recommends for throughput.
 */
const CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

export interface ChunkedUploadCallbacks {
  onProgress: (percent: number) => void;
  onComplete: (result: { uploadedFileId: string; storagePath: string }) => void;
  onError: (message: string) => void;
}

export interface UploadHandle {
  /** Aborts the in-progress upload and purges tus-js-client's own resume
   * record for this file (via `abort(true)`), so a subsequent re-selection
   * of the same file starts fresh rather than resuming a cancelled upload.
   * Used by the file list's "remove" action (UploadForm.tsx) — cancelling
   * always means the caller is discarding the file entirely, not pausing
   * it, so this fires no callback of its own. */
  cancel: () => void;
}

/**
 * Resumable upload to Supabase Storage via the TUS protocol
 * (https://supabase.com/docs/guides/storage/uploads/resumable-uploads).
 * Runs entirely browser-to-Supabase — this Next.js server never sees file
 * bytes (init-upload.ts only validates and hands back an object path;
 * complete-upload.ts only records the already-uploaded file).
 *
 * Resumability is tus-js-client's own responsibility: it fingerprints the
 * File (name/size/type/lastModified by default) and persists its own
 * in-progress upload URL in localStorage, so re-selecting the same file
 * after a reload (see UploadForm.tsx's resume affordance) naturally resumes
 * the same upload rather than restarting it — CLAUDE.md P8. No hand-rolled
 * resume bookkeeping needed here (the old R2 flow had its own; this
 * replaces it wholesale rather than layering on top).
 *
 * Returns a handle synchronously so the caller can cancel a still-running
 * upload (e.g. the file-list "remove" button on a failed/in-progress item)
 * without waiting for it to settle.
 */
export function uploadFileChunked(params: {
  providerId: string;
  sessionToken: string;
  file: File;
  fileType: UploadedFileType;
  callbacks: ChunkedUploadCallbacks;
}): UploadHandle {
  const { providerId, sessionToken, file, fileType, callbacks } = params;

  let currentUpload: tus.Upload | null = null;
  let cancelled = false;

  void (async () => {
    const init = await initUpload({ providerId, sessionToken, filename: file.name, fileSizeBytes: file.size });
    if (cancelled) return;
    if (!init.success || !init.objectPath) {
      callbacks.onError(init.error ?? "Could not start the upload.");
      return;
    }
    const objectPath = init.objectPath;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      callbacks.onError("Upload storage is not configured.");
      return;
    }

    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${anonKey}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK_SIZE_BYTES,
      metadata: {
        bucketName: PDC_UPLOADS_BUCKET,
        objectName: objectPath,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onError: (error) => {
        // tus-js-client already retries transient failures internally per
        // retryDelays — onError only fires once those are exhausted, so
        // this genuinely is "failed after several attempts" (matching the
        // old R2 flow's onError semantics), not a pause.
        if (cancelled) return;
        callbacks.onError(error.message ?? "Upload failed after several attempts. Your progress is saved — try again when your connection improves.");
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        if (cancelled) return;
        callbacks.onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: () => {
        if (cancelled) return;
        void (async () => {
          const result = await completeUpload({
            providerId,
            sessionToken,
            objectPath,
            filename: file.name,
            fileType,
            fileSizeBytes: file.size,
          });
          if (cancelled) return;
          if (!result.success || !result.uploadedFileId) {
            callbacks.onError(result.error ?? "Upload finished but could not be recorded.");
            return;
          }
          callbacks.onComplete({ uploadedFileId: result.uploadedFileId, storagePath: objectPath });
        })();
      },
    });

    currentUpload = upload;
    if (cancelled) {
      upload.abort(true).catch(() => undefined);
      return;
    }

    const previousUploads = await upload.findPreviousUploads();
    if (cancelled) return;
    const previousUpload = previousUploads[0];
    if (previousUpload) {
      upload.resumeFromPreviousUpload(previousUpload);
    }
    upload.start();
  })();

  return {
    cancel: () => {
      cancelled = true;
      currentUpload?.abort(true).catch(() => undefined);
    },
  };
}
