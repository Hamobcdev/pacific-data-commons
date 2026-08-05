import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
}

/** Grey animated placeholder bar — Session 10, Deliverable 5d. Used where a
 * step fetches server data on mount and previously showed nothing but a
 * line of plain text; on a slow Pacific connection (CLAUDE.md P8) that
 * reads as a broken page, not a loading one. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-gray-200", className)} aria-hidden="true" />;
}
