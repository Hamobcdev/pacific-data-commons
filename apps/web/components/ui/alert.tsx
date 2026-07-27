import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface AlertProps {
  children: ReactNode;
  variant?: "info" | "success" | "warning" | "error";
  className?: string;
}

const VARIANT_CLASSES: Record<NonNullable<AlertProps["variant"]>, string> = {
  info: "bg-light-bg border-ocean/30 text-navy",
  success: "bg-green-50 border-green-200 text-green-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  error: "bg-red-50 border-red-200 text-red-800",
};

/** R5: every error state needs a clear next action — this renders the
 * message, callers are responsible for including that action as children. */
export function Alert({ children, variant = "info", className }: AlertProps) {
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("rounded-lg border p-4 text-sm", VARIANT_CLASSES[variant], className)}>
      {children}
    </div>
  );
}
