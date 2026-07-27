"use client";

import { useTranslations } from "next-intl";
import type { UploadedFileState } from "@/lib/onboarding/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UploadProgress } from "./UploadProgress";

export interface FileListProps {
  files: UploadedFileState[];
  /** A PDF stays "pending" (not yet uploading) until this fires — see
   * Onboarding.Upload.scanned_pdf in the Step 3 spec. */
  onAnswerScanned: (fileId: string, isScanned: boolean) => void;
  /** Re-opens a file picker scoped to this file so its chunked upload can
   * resume — see UploadForm.tsx for why the raw File can't survive a reload. */
  onResumeRequest: (fileId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileList({ files, onAnswerScanned, onResumeRequest }: FileListProps) {
  const t = useTranslations("Onboarding.Upload");

  if (files.length === 0) return null;

  return (
    <ul className="mt-4 space-y-3">
      {files.map((file) => (
        <li key={file.id} className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800">{file.filename}</p>
              <p className="text-xs text-gray-500">{formatBytes(file.fileSizeBytes)}</p>
            </div>
            <StatusBadge status={file.uploadStatus} />
          </div>

          {file.uploadStatus === "queued" && needsScannedAnswer(file) && (
            <div className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
              <p>{t("scanned_pdf.question")}</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="secondary" onClick={() => onAnswerScanned(file.id, true)}>
                  {t("scanned_pdf.scanned")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => onAnswerScanned(file.id, false)}>
                  {t("scanned_pdf.text")}
                </Button>
              </div>
              <p className="mt-1 text-xs">{t("scanned_pdf.scanned_note")}</p>
            </div>
          )}

          {file.uploadStatus === "uploading" && <UploadProgress percent={file.uploadProgress} />}

          {(file.uploadStatus === "paused" || file.uploadStatus === "failed") && (
            <div className="mt-2 flex items-center gap-2">
              <p className="text-xs text-gray-500">{file.uploadStatus === "paused" ? t("resume.paused_note") : t("resume.failed_note")}</p>
              <Button type="button" variant="secondary" onClick={() => onResumeRequest(file.id)}>
                {t("resume.action")}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A PDF whose fileType hasn't been narrowed to pdf/pdf_scanned yet — see
 * UploadForm.tsx, which stores the placeholder as "pdf" until answered. */
function needsScannedAnswer(file: UploadedFileState): boolean {
  return file.fileType === "pdf" && file.filename.toLowerCase().endsWith(".pdf") && !file.r2Key;
}

function StatusBadge({ status }: { status: UploadedFileState["uploadStatus"] }) {
  const t = useTranslations("Onboarding.Upload.status");
  if (status === "complete") return <Badge variant="success">{t("complete")}</Badge>;
  if (status === "failed") return <Badge variant="error">{t("failed")}</Badge>;
  if (status === "paused") return <Badge variant="warning">{t("paused")}</Badge>;
  if (status === "uploading") return <Badge variant="neutral">{t("uploading")}</Badge>;
  return <Badge variant="neutral">{t("queued")}</Badge>;
}
