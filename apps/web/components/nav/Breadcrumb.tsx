import { Link } from "@/i18n/navigation";

export interface BreadcrumbItem {
  label: string;
  /** Omit for the current page — renders as plain text, not a link. */
  href?: string;
}

/**
 * Session 20 — authenticated pages had no in-app sense of location, only
 * the browser back button. Server component: every href here is already a
 * known, static-per-page route (or resolved server-side before render), so
 * no client interactivity is needed.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-500">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && (
            <span aria-hidden="true" className="text-gray-300">
              ›
            </span>
          )}
          {item.href ? (
            <Link href={item.href} className="hover:text-ocean hover:underline">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page" className="font-medium text-navy">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
