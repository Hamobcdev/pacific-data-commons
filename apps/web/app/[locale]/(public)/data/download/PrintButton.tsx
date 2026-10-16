"use client";

import { Button } from "@/components/ui/button";

/**
 * No server-side PDF generation for competition (per build brief) —
 * window.print() + the page's own @media print rules (see page.tsx) is
 * the "Save as PDF" path. The only reason this is its own tiny Client
 * Component rather than inline in the (Server Component) page: an
 * onClick handler needs "use client", and this is the only interactive
 * element the download page has.
 */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" className="print:hidden" onClick={() => window.print()}>
      Save as PDF
    </Button>
  );
}
