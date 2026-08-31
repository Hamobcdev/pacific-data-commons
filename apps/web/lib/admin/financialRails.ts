/**
 * Session 39 — server-side data fetch for /admin/financial-rails
 * (Component B). Talks to @pdc/financial-rails (Component A) over its
 * Railway *internal* URL — FINANCIAL_RAILS_INTERNAL_URL — never the
 * public internet, since that service has no public domain by design
 * (see apps/financial-rails/src/index.ts's doc comment). FINANCIAL_RAILS_KEY
 * is sent as `Authorization: Bearer <key>`, matching
 * apps/financial-rails/src/middleware/financialRailsAuth.ts. This module
 * must only ever be imported from a Server Component / Server Action —
 * both env vars are private and must never reach the browser.
 *
 * Every fetch degrades independently rather than throwing: this dashboard
 * is a stub-stage operator view (CLAUDE.md P5 still applies, but a down
 * financial-rails service should render a clear "unavailable" state per
 * section, not a 500 for the whole page).
 */

export interface FetchResult<T> {
  data: T | null;
  error: string | null;
}

interface ReservesSummary {
  total_usdc_in_ecosystem: number;
  cbs_custodial_usdc: number;
  donor_grant_usdc: number;
  pending_conversion: number;
  active_providers: number;
  stub_providers: number;
  stub: boolean;
  last_updated: string;
  by_node: Record<string, number>;
}

export interface PaymentProviderStatus {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_type: string;
  status: "stub" | "active" | "suspended" | "decommissioned";
  cbs_approved: boolean;
  activated_at: string | null;
}

interface ProvidersStatusResponse {
  providers: PaymentProviderStatus[];
  total: number;
  stub: boolean;
}

interface CbsOversightEcosystem {
  monetary_authority: string;
  oversight_nodes: unknown[];
  hierarchy: {
    tier_1_central_bank: string;
    tier_2_commercial_banks: readonly string[];
    tier_3_mobile_money: readonly string[];
    tier_4_infrastructure: string;
  };
  compliance_summary: {
    total_checks: number;
    flagged_pending_cbs_review: number;
    cleared: number;
    stub: boolean;
  };
  escrow_status: {
    custodian: string;
    status: string;
    activation_gate: string;
  };
}

export interface ComplianceFlag {
  id: string;
  check_type: string;
  entity_type: string | null;
  wallet_address: string | null;
  platform_node: string | null;
  transaction_type: string | null;
  amount_usdc: number | null;
  risk_level: string | null;
  risk_score: number | null;
  flags: unknown;
  checked_at: string;
  cbs_reviewed: boolean;
  notes: string | null;
}

interface ComplianceFlagsResponse {
  flags: ComplianceFlag[];
  total: number;
  stub: boolean;
}

export interface PlatformNode {
  node_id: string;
  node_name: string;
  node_type: string;
  status: string;
  discovery_url?: string | null;
  base_url?: string | null;
  cbs_read_access?: boolean;
  compliance_monitored?: boolean;
}

interface PsrNodesResponse {
  registry_version: string;
  ecosystem_summary: { total_nodes: number };
  platform_nodes: PlatformNode[];
}

async function financialRailsFetch<T>(path: string): Promise<FetchResult<T>> {
  const baseUrl = process.env.FINANCIAL_RAILS_INTERNAL_URL;
  const key = process.env.FINANCIAL_RAILS_KEY;
  if (!baseUrl || !key) {
    return { data: null, error: "FINANCIAL_RAILS_INTERNAL_URL / FINANCIAL_RAILS_KEY not configured" };
  }

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: `Bearer ${key}`, "x-calling-service": "pdc-web-admin-dashboard" },
      cache: "no-store",
    });
    if (!res.ok) {
      return { data: null, error: `financial-rails ${path} returned ${res.status}` };
    }
    return { data: (await res.json()) as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "financial-rails request failed" };
  }
}

export function getReservesSummary(): Promise<FetchResult<ReservesSummary>> {
  return financialRailsFetch<ReservesSummary>("/reserves/summary");
}

export function getProvidersStatus(): Promise<FetchResult<ProvidersStatusResponse>> {
  return financialRailsFetch<ProvidersStatusResponse>("/providers/status");
}

export function getCbsOversightEcosystem(): Promise<FetchResult<CbsOversightEcosystem>> {
  return financialRailsFetch<CbsOversightEcosystem>("/cbs-oversight/ecosystem");
}

export function getComplianceFlags(): Promise<FetchResult<ComplianceFlagsResponse>> {
  return financialRailsFetch<ComplianceFlagsResponse>("/cbs-oversight/compliance-flags");
}

/**
 * Platform node registry — read from apps/directory-api's public,
 * unauthenticated /psr/v1/nodes route (NEXT_PUBLIC_DIRECTORY_API_URL),
 * not from financial-rails. This is deliberately the one call in this
 * module that doesn't go through financialRailsFetch(): the PSR node
 * registry is public specification data (see routes/psr.ts's doc comment
 * in apps/directory-api), not financial-rails-internal data — no
 * FINANCIAL_RAILS_KEY is sent or needed.
 */
export async function getPlatformNodes(): Promise<FetchResult<PsrNodesResponse>> {
  const baseUrl = process.env.NEXT_PUBLIC_DIRECTORY_API_URL;
  if (!baseUrl) {
    return { data: null, error: "NEXT_PUBLIC_DIRECTORY_API_URL not configured" };
  }
  try {
    const res = await fetch(`${baseUrl}/psr/v1/nodes`, { cache: "no-store" });
    if (!res.ok) {
      return { data: null, error: `/psr/v1/nodes returned ${res.status}` };
    }
    return { data: (await res.json()) as PsrNodesResponse, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "/psr/v1/nodes request failed" };
  }
}
