import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges class names, letting later Tailwind utility classes win over
 * earlier conflicting ones (e.g. cn("p-2", condition && "p-4")). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
