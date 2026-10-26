import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, invalid, type, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-invalid={invalid}
      className={cn(
        "h-4 w-4 rounded border-gray-300 text-ocean shadow-sm",
        "focus:outline-none focus:ring-2 focus:ring-ocean focus:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "border-red-400",
        className,
      )}
      {...props}
    />
  );
});
