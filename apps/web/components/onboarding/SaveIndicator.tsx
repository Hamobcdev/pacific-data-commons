"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export type SaveStatus = "idle" | "saving" | "saved";

export interface SaveIndicatorProps {
  status: SaveStatus;
  className?: string;
}

/** R3: every field auto-saves — this is the visible confirmation that it
 * actually happened, so an intermittent connection doesn't leave the
 * provider wondering whether their work is safe. */
export function SaveIndicator({ status, className }: SaveIndicatorProps) {
  const t = useTranslations("Onboarding.save");

  if (status === "idle") return null;

  return (
    <div className={cn("flex items-center gap-1.5 text-xs", status === "saving" ? "text-gray-400" : "text-ocean", className)} role="status">
      {status === "saving" ? (
        <>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
          {t("saving")}
        </>
      ) : (
        <>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-ocean" />
          {t("saved")}
        </>
      )}
    </div>
  );
}
