"use client";

import { useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";

const ACCEPTED_EXTENSIONS = ["pdf", "xlsx", "csv", "docx", "md", "zip"];
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
}

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

/** Drag-drop + click-to-browse file picker with pre-upload validation
 * (type + size) — rejected files never reach lib/upload/chunked.ts at all,
 * so the provider gets an immediate, specific reason instead of a failed
 * upload attempt. */
export function FileUploadZone({ onFilesSelected }: FileUploadZoneProps) {
  const t = useTranslations("Onboarding.Upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    setRejectionError(null);

    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of Array.from(fileList)) {
      const ext = extensionOf(file.name);
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        rejected.push(t("errors.rejected_type", { filename: file.name }));
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        rejected.push(t("errors.rejected_size", { filename: file.name }));
        continue;
      }
      accepted.push(file);
    }

    if (rejected.length > 0) {
      setRejectionError(rejected.join(" "));
    }
    if (accepted.length > 0) {
      onFilesSelected(accepted);
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragging ? "border-ocean bg-light-bg" : "border-gray-300 bg-gray-50 hover:bg-gray-100"
        }`}
      >
        <p className="text-sm font-medium text-navy">{t("drag_drop")}</p>
        <p className="mt-1 text-xs text-gray-500">{t("formats")}</p>
        <p className="text-xs text-gray-500">{t("max_size")}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {rejectionError && (
        <Alert variant="error" className="mt-2">
          {rejectionError}
        </Alert>
      )}
    </div>
  );
}
