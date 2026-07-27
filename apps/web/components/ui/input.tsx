import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid}
      className={cn(
        "mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm",
        "focus:outline-none focus:ring-2 focus:ring-ocean focus:border-ocean",
        "disabled:bg-gray-100 disabled:text-gray-500",
        invalid ? "border-red-400" : "border-gray-300",
        className,
      )}
      {...props}
    />
  );
});
