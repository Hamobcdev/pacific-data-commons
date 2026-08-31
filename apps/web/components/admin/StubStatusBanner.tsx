/**
 * Session 39 — always-visible amber callout at the top of
 * /admin/financial-rails. Mirrors the tone of other stub-mode UI in this
 * app (FoundingPartnerDashboardBanner's card treatment) but uses amber
 * rather than the brand palette — this is a warning-of-scope banner, not a
 * promotional one.
 */
export function StubStatusBanner() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-base text-amber-900">
      <p className="font-semibold">Financial rails are in stub mode.</p>
      <p className="mt-1">
        CBS regulatory position (H1) required before live monitoring, escrow, and reserve management activate. Current: read-only service discovery and
        compliance architecture.
      </p>
    </div>
  );
}
