import type { UploadedFileType } from "@pdc/shared-types";
import { initUpload } from "@/actions/upload/init-upload";
import { getPartUploadUrl } from "@/actions/upload/get-part-url";
import { completeUpload } from "@/actions/upload/complete-upload";

/**
 * Cloudflare R2 (S3-compatible) multipart upload minimum part size is 5MB
 * for every part except the last — R2 rejects smaller non-final parts. A
 * literal 1MB chunk size (as a first draft of this spec assumed) isn't
 * achievable with S3 Multipart Upload; 5MB is the smallest chunk that's
 * actually resumable on this storage API, and still bounds how much a
 * dropped connection loses on a slow Pacific link far better than
 * restarting the whole file.
 */
const CHUNK_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_ATTEMPTS_PER_PART = 4;
const RESUME_STORAGE_PREFIX = "pdc-upload-resume:";

interface ResumeRecord {
  uploadId: string;
  key: string;
  fileType: UploadedFileType;
  parts: Array<{ partNumber: number; etag: string }>;
}

export interface ChunkedUploadCallbacks {
  onProgress: (percent: number) => void;
  onPaused: () => void;
  onComplete: (result: { uploadedFileId: string; r2Key: string }) => void;
  onError: (message: string) => void;
}

function resumeStorageKey(providerId: string, filename: string, fileSizeBytes: number): string {
  return `${RESUME_STORAGE_PREFIX}${providerId}:${filename}:${fileSizeBytes}`;
}

function loadResumeRecord(storageKey: string): ResumeRecord | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as ResumeRecord) : null;
  } catch {
    return null;
  }
}

function saveResumeRecord(storageKey: string, record: ResumeRecord): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(record));
  } catch {
    // Non-fatal — worst case a resumed upload restarts from part 1.
  }
}

function clearResumeRecord(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Non-fatal.
  }
}

function backoff(attempt: number): Promise<void> {
  const ms = Math.min(1000 * 2 ** (attempt - 1), 8000);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Uploads one part with retry + exponential backoff. Requires the R2 bucket
 * CORS policy to expose the ETag header to the browser
 * (ExposeHeaders: ["ETag"]) — without it, res.headers.get("ETag") is null
 * even on a successful PUT, since browsers hide non-exposed headers on
 * cross-origin responses by default. Deployment-config note, not fixable in
 * application code.
 */
async function uploadPartWithRetry(key: string, uploadId: string, partNumber: number, chunk: Blob): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PART; attempt++) {
    const urlResult = await getPartUploadUrl({ key, uploadId, partNumber });
    if (!urlResult.success || !urlResult.url) {
      await backoff(attempt);
      continue;
    }
    try {
      const res = await fetch(urlResult.url, { method: "PUT", body: chunk });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const etag = res.headers.get("ETag");
      if (!etag) throw new Error("Missing ETag in response");
      return etag;
    } catch {
      await backoff(attempt);
    }
  }
  return null;
}

/**
 * Resumable chunked upload, fetch-based, no upload library. Resume state
 * (uploadId, key, completed part ETags) lives in localStorage keyed by
 * provider+filename+size, so re-selecting the same file after closing the
 * browser picks up from the last completed part instead of restarting.
 */
export async function uploadFileChunked(params: {
  providerId: string;
  file: File;
  fileType: UploadedFileType;
  callbacks: ChunkedUploadCallbacks;
  signal?: AbortSignal;
}): Promise<void> {
  const { providerId, file, fileType, callbacks, signal } = params;
  const storageKey = resumeStorageKey(providerId, file.name, file.size);

  let record = loadResumeRecord(storageKey);
  if (!record) {
    const init = await initUpload({ providerId, filename: file.name, fileSizeBytes: file.size });
    if (!init.success || !init.uploadId || !init.key) {
      callbacks.onError(init.error ?? "Could not start the upload.");
      return;
    }
    record = { uploadId: init.uploadId, key: init.key, fileType, parts: [] };
    saveResumeRecord(storageKey, record);
  }

  const totalParts = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES));
  const completedPartNumbers = new Set(record.parts.map((p) => p.partNumber));

  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    if (signal?.aborted) {
      callbacks.onPaused();
      return;
    }
    if (completedPartNumbers.has(partNumber)) continue;

    const start = (partNumber - 1) * CHUNK_SIZE_BYTES;
    const end = Math.min(start + CHUNK_SIZE_BYTES, file.size);
    const chunk = file.slice(start, end);

    const etag = await uploadPartWithRetry(record.key, record.uploadId, partNumber, chunk);
    if (etag === null) {
      callbacks.onError("Upload paused after repeated failures. Your progress is saved — try again when your connection improves.");
      return;
    }

    record.parts.push({ partNumber, etag });
    saveResumeRecord(storageKey, record);
    callbacks.onProgress(Math.round((record.parts.length / totalParts) * 100));
  }

  const result = await completeUpload({
    providerId,
    key: record.key,
    uploadId: record.uploadId,
    parts: record.parts,
    filename: file.name,
    fileType: record.fileType,
    fileSizeBytes: file.size,
  });

  if (!result.success || !result.uploadedFileId || !result.r2Key) {
    callbacks.onError(result.error ?? "Could not finish the upload.");
    return;
  }

  clearResumeRecord(storageKey);
  callbacks.onComplete({ uploadedFileId: result.uploadedFileId, r2Key: result.r2Key });
}
