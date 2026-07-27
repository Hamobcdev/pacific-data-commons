import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}

/** Native <select> — best mobile keyboard/picker behaviour on the low-end
 * Android devices common on Pacific mobile data (R6), no custom dropdown
 * library needed. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, options, placeholder, invalid, value, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      value={value}
      aria-invalid={invalid}
      className={cn(
        "mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm bg-white",
        "focus:outline-none focus:ring-2 focus:ring-ocean focus:border-ocean",
        "disabled:bg-gray-100 disabled:text-gray-500",
        invalid ? "border-red-400" : "border-gray-300",
        className,
      )}
      {...props}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
});
