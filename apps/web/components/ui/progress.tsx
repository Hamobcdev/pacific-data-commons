import { cn } from "@/lib/cn";

export interface ProgressProps {
  /** 0-100 */
  value: number;
  className?: string;
  label?: string;
}

export function Progress({ value, className, label }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("w-full overflow-hidden rounded-full bg-gray-200 h-1.5", className)}
    >
      <div className="h-full rounded-full bg-ocean transition-all duration-300" style={{ width: `${clamped}%` }} />
    </div>
  );
}
