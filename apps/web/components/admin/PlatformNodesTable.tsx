import { Badge } from "@/components/ui/badge";
import type { PlatformNode } from "@/lib/admin/financialRails";

/** Session 39 — Section 3, all 8 platform nodes from the PSR registry. */
export function PlatformNodesTable({ nodes }: { nodes: PlatformNode[] }) {
  if (nodes.length === 0) {
    return <p className="text-sm text-gray-500">Platform node registry unavailable — could not reach the PSR /psr/v1/nodes endpoint.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-light-bg">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Node</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">CBS Oversight</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Compliance Monitored</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {nodes.map((node) => {
            const href = node.discovery_url ?? node.base_url ?? undefined;
            return (
              <tr key={node.node_id}>
                <td className="px-3 py-2 font-medium text-navy">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {node.node_name}
                    </a>
                  ) : (
                    node.node_name
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600">{node.node_type}</td>
                <td className="px-3 py-2 text-gray-600">{node.status}</td>
                <td className="px-3 py-2">{node.cbs_read_access ? "✓" : "—"}</td>
                <td className="px-3 py-2">{node.compliance_monitored ? "✓" : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Badge variant="neutral" className="m-3">
        {nodes.length} node{nodes.length === 1 ? "" : "s"} registered
      </Badge>
    </div>
  );
}
