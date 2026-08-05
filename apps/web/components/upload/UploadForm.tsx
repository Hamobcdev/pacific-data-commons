"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { UploadedFileType } from "@pdc/shared-types";
import { uploadFileChunked, type UploadHandle } from "@/lib/upload/chunked";
import { saveUploadContext } from "@/actions/onboarding/upload-context";
import { loadLocalState, saveLocalState, defaultState, type OnboardingState, type UploadedFileState } from "@/lib/onboarding/state";
import { uploadContextSchema } from "@/lib/onboarding/validation";
import { SESSION_EXPIRED_ERROR } from "@/lib/onboarding/session-constants";
import { flagSessionExpired } from "@/lib/onboarding/flag-session-expired";
import { FileUploadZone } from "./FileUploadZone";
import { FileList } from "./FileList";
import { DataContextForm } from "./DataContextForm";
import { Alert } from "@/components/ui/alert";
import { StepNav } from "@/components/onboarding/StepNav";

type UploadFormState = OnboardingState["upload"];

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function guessFileType(filename: string): UploadedFileType {
  const ext = extensionOf(filename);
  if (ext === "pdf") return "pdf"; // narrowed to pdf_scanned once answered, see FileList
  if (["xlsx", "csv", "docx", "md", "zip"].includes(ext)) return ext as UploadedFileType;
  return "other";
}

export function UploadForm() {
  const t = useTranslations("Onboarding.Upload");
  const tShell = useTranslations("Onboarding.shell");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [form, setForm] = useState<UploadFormState>(() => loadLocalState()?.upload ?? defaultState().upload);

  // Same fix as WalletForm (Session 9 follow-up): `return null` while
  // localStorage hasn't been read yet (impossible during SSR) and while
  // confirmed-missing-and-redirecting looked identical — an indefinite
  // blank page on a slow connection. R5: no dead ends, never a blank screen.
  const [status, setStatus] = useState<"checking" | "redirecting" | "ready">("checking");

  // Raw File objects can't survive localStorage (or a reload) — only the
  // serializable UploadedFileState does. This map exists purely in memory
  // for the current page session.
  const filesRef = useRef<Map<string, File>>(new Map());
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const resumeTargetId = useRef<string | null>(null);
  // Live upload handles, keyed by file id — lets handleRemoveFile cancel an
  // in-progress or retryable upload (and purge its tus-js-client resume
  // record) before dropping it from the list.
  const uploadHandlesRef = useRef<Map<string, UploadHandle>>(new Map());

  useEffect(() => {
    const state = loadLocalState();
    if (!state?.providerId || !state.sessionToken) {
      setStatus("redirecting");
      router.replace("/onboarding/register");
      return;
    }
    setProviderId(state.providerId);
    setSessionToken(state.sessionToken);
    setStatus("ready");

    // A page reload means every in-flight upload actually stopped, even if
    // the last-saved status still says "uploading" — relabel so the UI
    // (and the resume affordance) reflects reality instead of showing a
    // progress bar that will never move again.
    setForm((prev) => {
      const corrected = {
        ...prev,
        uploadedFiles: prev.uploadedFiles.map((f) => (f.uploadStatus === "uploading" ? { ...f, uploadStatus: "paused" as const } : f)),
      };
      persist(corrected);
      return corrected;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const persist = (updated: UploadFormState) => {
    setForm(updated);
    const state = loadLocalState() ?? defaultState();
    saveLocalState({ ...state, upload: updated });
  };

  const updateFile = (fileId: string, patch: Partial<UploadedFileState>) => {
    setForm((prev) => {
      const updated = { ...prev, uploadedFiles: prev.uploadedFiles.map((f) => (f.id === fileId ? { ...f, ...patch } : f)) };
      const state = loadLocalState() ?? defaultState();
      saveLocalState({ ...state, upload: updated });
      return updated;
    });
  };

  const startUpload = (fileId: string, file: File, fileType: UploadedFileType) => {
    if (!providerId || !sessionToken) return;
    updateFile(fileId, { uploadStatus: "uploading", uploadProgress: 0, fileType });
    const handle = uploadFileChunked({
      providerId,
      sessionToken,
      file,
      fileType,
      callbacks: {
        onProgress: (percent) => updateFile(fileId, { uploadProgress: percent }),
        onComplete: ({ uploadedFileId, storagePath }) => {
          uploadHandlesRef.current.delete(fileId);
          updateFile(fileId, { uploadStatus: "complete", uploadProgress: 100, storagePath, supabaseFileId: uploadedFileId });
        },
        onError: () => {
          uploadHandlesRef.current.delete(fileId);
          updateFile(fileId, { uploadStatus: "failed" });
        },
      },
    });
    uploadHandlesRef.current.set(fileId, handle);
  };

  /** X button on a failed upload (FileList) — cancels the upload if
   * tus-js-client is still retrying it, then drops the entry from both
   * form state and localStorage (persist() below writes through). */
  const handleRemoveFile = (fileId: string) => {
    uploadHandlesRef.current.get(fileId)?.cancel();
    uploadHandlesRef.current.delete(fileId);
    filesRef.current.delete(fileId);
    persist({ ...form, uploadedFiles: form.uploadedFiles.filter((f) => f.id !== fileId) });
  };

  const handleFilesSelected = (selected: File[]) => {
    const newEntries: UploadedFileState[] = [];
    for (const file of selected) {
      const id = crypto.randomUUID();
      filesRef.current.set(id, file);
      newEntries.push({
        id,
        filename: file.name,
        fileType: guessFileType(file.name),
        fileSizeBytes: file.size,
        uploadStatus: "queued",
        uploadProgress: 0,
        storagePath: null,
        supabaseFileId: null,
      });
    }
    persist({ ...form, uploadedFiles: [...form.uploadedFiles, ...newEntries] });

    // Non-PDFs (and anything that doesn't need the scanned/text question)
    // start immediately; PDFs wait for FileList's inline question.
    for (const entry of newEntries) {
      if (entry.fileType !== "pdf") {
        const file = filesRef.current.get(entry.id);
        if (file) startUpload(entry.id, file, entry.fileType);
      }
    }
  };

  const handleAnswerScanned = (fileId: string, isScanned: boolean) => {
    const file = filesRef.current.get(fileId);
    const fileType: UploadedFileType = isScanned ? "pdf_scanned" : "pdf";
    if (file) {
      startUpload(fileId, file, fileType);
    } else {
      updateFile(fileId, { fileType });
    }
  };

  const handleResumeRequest = (fileId: string) => {
    resumeTargetId.current = fileId;
    resumeInputRef.current?.click();
  };

  const handleResumeFileChosen = (fileList: FileList | null) => {
    const fileId = resumeTargetId.current;
    const file = fileList?.[0];
    if (!fileId || !file) return;
    const target = form.uploadedFiles.find((f) => f.id === fileId);
    if (!target) return;
    if (file.name !== target.filename || file.size !== target.fileSizeBytes) {
      setError(t("resume.mismatch_error", { filename: target.filename }));
      return;
    }
    filesRef.current.set(fileId, file);
    startUpload(fileId, file, target.fileType);
  };

  const completedFileIds = form.uploadedFiles.filter((f) => f.uploadStatus === "complete" && f.supabaseFileId).map((f) => f.supabaseFileId as string);

  const parsedContext = uploadContextSchema.safeParse({
    ...form,
    uploadedFiles: completedFileIds.map((id) => ({ id, uploadStatus: "complete" as const })),
  });
  const canSubmit = parsedContext.success;

  const handleSubmit = () => {
    if (!providerId || !sessionToken || !parsedContext.success) return;
    setError(null);
    startTransition(async () => {
      const result = await saveUploadContext(providerId, sessionToken, completedFileIds, parsedContext.data);

      if (result.success) {
        const state = loadLocalState() ?? defaultState();
        saveLocalState({ ...state, currentStep: "review" });
        router.push("/onboarding/review");
      } else if (result.error === SESSION_EXPIRED_ERROR) {
        flagSessionExpired(tShell("sessionExpired"));
        router.push("/onboarding");
      } else {
        setError(result.error ?? t("genericError"));
      }
    });
  };

  if (status === "checking") {
    return <p className="mt-6 text-sm text-gray-500">{t("loading")}</p>;
  }

  if (status === "redirecting" || !providerId || !sessionToken) {
    return <p className="mt-6 text-sm text-gray-500">{t("redirecting")}</p>;
  }

  return (
    <div className="mt-6 space-y-6">
      <FileUploadZone onFilesSelected={handleFilesSelected} />
      <FileList files={form.uploadedFiles} onAnswerScanned={handleAnswerScanned} onResumeRequest={handleResumeRequest} onRemove={handleRemoveFile} />
      <input
        ref={resumeInputRef}
        type="file"
        className="sr-only"
        onChange={(e) => handleResumeFileChosen(e.target.files)}
      />

      <DataContextForm value={form} onChange={(field, value) => persist({ ...form, [field]: value })} />

      {error && <Alert variant="error">{error}</Alert>}

      <StepNav
        onBack={() => router.push("/onboarding/wallet")}
        onNext={handleSubmit}
        nextDisabled={!canSubmit}
        nextLabel={t("continue")}
        isSubmitting={isPending}
      />
    </div>
  );
}
