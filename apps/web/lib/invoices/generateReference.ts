import { createServiceClient } from "@/lib/supabase/server";

/**
 * Generates a unique PDC invoice reference in the format PDC-YYYY-NNNN
 * (e.g. PDC-2026-0001). Counts existing deployment_invoices rows for the
 * current calendar year and increments — resets naturally at the start of
 * each year since the LIKE filter is year-scoped.
 *
 * This is a "generate, then let the DB's UNIQUE constraint on
 * invoice_reference catch a race" approach, not a transactional sequence —
 * safe at this feature's actual concurrency (a provider submitting their
 * own single deployment request), not safe as the sole guard under high
 * concurrency. Callers must handle a unique-constraint violation on insert
 * by retrying (see apps/web/actions/onboarding/deploy-request.ts).
 *
 * Server-side only — uses the service-role Supabase client, never callable
 * from a client component.
 */
export async function generateInvoiceReference(): Promise<string> {
  const supabase = createServiceClient();
  const year = new Date().getFullYear();
  const prefix = `PDC-${year}-`;

  const { count, error } = await supabase
    .from("deployment_invoices")
    .select("id", { count: "exact", head: true })
    .like("invoice_reference", `${prefix}%`);

  if (error) {
    throw new Error(`Could not generate invoice reference: ${error.message}`);
  }

  const sequence = (count ?? 0) + 1;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}
