import type { ComplianceFlag } from "@/lib/admin/financialRails";

/** Session 39 — Section 5. compliance_checks rows where status='flagged'. */
export function ComplianceFlagsTable({ flags }: { flags: ComplianceFlag[] }) {
  if (flags.length === 0) {
    return <p className="text-sm text-gray-500">No flagged transactions — compliance engine is in stub mode.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-light-bg">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Checked</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Entity</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Wallet</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Risk</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">CBS Reviewed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {flags.map((flag) => (
            <tr key={flag.id}>
              <td className="px-3 py-2 text-gray-600">{new Date(flag.checked_at).toLocaleString()}</td>
              <td className="px-3 py-2 text-gray-600">{flag.check_type}</td>
              <td className="px-3 py-2 text-gray-600">{flag.entity_type ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-gray-500">{flag.wallet_address ?? "—"}</td>
              <td className="px-3 py-2 text-gray-600">{flag.risk_level ?? "—"}</td>
              <td className="px-3 py-2">{flag.cbs_reviewed ? "✓" : "Pending"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
