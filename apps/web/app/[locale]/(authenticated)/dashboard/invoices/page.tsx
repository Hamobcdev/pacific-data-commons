import { redirect } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getResumedProvider } from "@/lib/onboarding/resume";
import { getProviderDeploymentInvoices } from "@/lib/dashboard/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/nav/Breadcrumb";
import type { DeploymentPaymentStatus, DeploymentTier } from "@pdc/shared-types";

const STATUS_LABEL: Record<DeploymentPaymentStatus, string> = {
  not_required: "No payment needed",
  pending: "Pending",
  submitted: "Payment submitted — awaiting confirmation",
  confirmed: "Confirmed",
  bank_transfer_pending: "Bank transfer pending",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<DeploymentPaymentStatus, string> = {
  not_required: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-800",
  submitted: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  bank_transfer_pending: "bg-amber-100 text-amber-800",
  cancelled: "bg-gray-100 text-gray-500",
};

const TIER_LABEL: Record<DeploymentTier, string> = {
  self_service: "Self-service",
  assisted: "Assisted",
  complex: "Complex",
};

/** Session 37B, Deliverable 5 — provider-facing view of their own
 * deployment_invoices rows. Same auth/data-fetch pattern as the sibling
 * ../transactions/page.tsx: getResumedProvider() for auth, a
 * service-role-scoped lib/dashboard/data.ts helper for the actual read. */
export default async function DeploymentInvoicesPage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const tNav = await getTranslations("Nav");
  const resumed = await getResumedProvider();
  if (!resumed) {
    return redirect({ href: "/onboarding/register", locale });
  }

  const invoices = await getProviderDeploymentInvoices(resumed.providerId);

  return (
    <div className="px-6 py-8 space-y-4 max-w-3xl">
      <Breadcrumb items={[{ label: tNav("dashboard"), href: "/dashboard" }, { label: "Deployment Invoices" }]} />
      <h1 className="text-2xl font-bold text-navy">Deployment Invoices</h1>

      <Card>
        <CardHeader>
          <CardTitle>Your deployment requests</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-gray-500">No deployment invoices yet. Complete your onboarding to see your deployment records here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4 font-medium">Reference</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Submitted</th>
                    <th className="py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="py-2 pr-4 font-mono text-xs text-navy">{invoice.invoice_reference}</td>
                      <td className="py-2 pr-4 text-gray-700">{TIER_LABEL[invoice.deployment_tier]}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[invoice.payment_status]}`}>
                          {STATUS_LABEL[invoice.payment_status]}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{new Date(invoice.created_at).toLocaleDateString()}</td>
                      <td className="py-2 font-medium text-navy">
                        {invoice.invoice_amount_usdc === null || invoice.invoice_amount_usdc === 0
                          ? "Free"
                          : `$${invoice.invoice_amount_usdc.toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
