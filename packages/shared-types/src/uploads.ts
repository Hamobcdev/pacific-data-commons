/**
 * Mirrors the `uploaded_files` table exactly (supabase/migrations/session1_migration.sql,
 * DOMAIN 4 — onboarding pipeline). Did not exist in shared-types before
 * Session 5 — no app touched this table until apps/web's upload step.
 */

export type UploadedFileType = "pdf" | "pdf_scanned" | "xlsx" | "csv" | "docx" | "md" | "zip" | "other";

export type UploadedFileProcessingStatus =
  | "uploaded"
  | "parsing"
  | "parsed"
  | "pipeline_queued"
  | "pipeline_running"
  | "pipeline_complete"
  | "failed"
  | "deleted";

export interface UploadedFile {
  id: string;
  provider_id: string;

  original_filename: string;
  file_type: UploadedFileType;
  file_size_bytes: number | null;
  /** Cloudflare R2 object key — used to retrieve and delete. */
  r2_key: string;

  processing_status: UploadedFileProcessingStatus;
  parse_output: Record<string, unknown> | null;
  parse_error: string | null;

  uploaded_at: string;
  processed_at: string | null;
  approved_at: string | null;
  /** Set when the R2 object is deleted — null means the file still exists. */
  deleted_at: string | null;
}
