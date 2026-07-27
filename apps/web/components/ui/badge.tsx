import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface BadgeProps {
  children: ReactNode;
  variant?: "neutral" | "success" | "warning" | "error";
  className?: string;
}

const VARIANT_CLASSES: Record<NonNullable<BadgeProps["variant"]>, string> = {
  neutral: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
};

export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", VARIANT_CLASSES[variant], className)}>
      {children}
    </span>
  );
}
