import { Badge } from "@/components/ui/badge";
import type { PaymentProviderStatus } from "@/lib/admin/financialRails";

interface PaymentProvidersTableProps {
  providers: PaymentProviderStatus[];
  allTypes: string[];
  allStatuses: string[];
  selectedType: string;
  selectedStatus: string;
}

/**
 * Session 39 — Section 4. Filters submit via a plain GET form (no client
 * JS) — CLAUDE.md P8: Pacific connectivity constraints favour a server
 * round-trip over a client-side filter bundle for a page this rarely
 * visited. `/admin/financial-rails?type=...&status=...` is bookmarkable.
 */
export function PaymentProvidersTable({ providers, allTypes, allStatuses, selectedType, selectedStatus }: PaymentProvidersTableProps) {
  return (
    <div className="space-y-3">
      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Provider type</span>
          <select name="type" defaultValue={selectedType} className="rounded-md border border-gray-300 px-2 py-1.5">
            <option value="">All types</option>
            {allTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Status</span>
          <select name="status" defaultValue={selectedStatus} className="rounded-md border border-gray-300 px-2 py-1.5">
            <option value="">All statuses</option>
            {allStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md border border-navy/30 bg-white px-4 py-1.5 text-navy hover:bg-light-bg">
          Filter
        </button>
      </form>

      {providers.length === 0 ? (
        <p className="text-sm text-gray-500">No payment providers match this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-light-bg">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Provider</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">CBS Approved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {providers.map((provider) => (
                <tr key={provider.id} className={provider.status === "stub" ? "bg-amber-50/50" : undefined}>
                  <td className="px-3 py-2 font-medium text-navy">{provider.provider_name}</td>
                  <td className="px-3 py-2 text-gray-600">{provider.provider_type}</td>
                  <td className="px-3 py-2">
                    <Badge variant={provider.status === "active" ? "success" : provider.status === "stub" ? "warning" : "neutral"}>{provider.status}</Badge>
                  </td>
                  <td className="px-3 py-2">{provider.cbs_approved ? <Badge variant="success">CBS approved</Badge> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
