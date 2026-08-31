/**
 * Session 39 — local copy of the PSR (Pacific Service Registry) platform
 * node registry, scoped to the fields this service's CBS oversight routes
 * actually use (node_id, node_name, node_type, status, discovery/base URL,
 * cbs_read_access, compliance_monitored).
 *
 * Must stay consistent with apps/directory-api/src/lib/psrSpec.ts's
 * `platform_nodes` array (registry_version "1.1.0", 8 nodes) and its
 * byte-identical source apps/web/public/psr/v1/spec.json. Duplicated here
 * rather than fetched cross-service for the same reason psrSpec.ts gives:
 * apps/financial-rails, apps/directory-api, and apps/web are three
 * separate Railway services with independent builds and no shared
 * filesystem at runtime, and this service has no public route from which
 * to reach directory-api's public /psr/v1/nodes endpoint without adding a
 * network dependency for what is, for now, a small static registry. Update
 * all three copies together whenever the PSR node registry changes.
 */

export interface PlatformNode {
  node_id: string;
  node_name: string;
  node_type: string;
  status: string;
  base_url: string | null;
  discovery_url: string | null;
  cbs_read_access: boolean;
  compliance_monitored: boolean;
}

export const PLATFORM_NODES: PlatformNode[] = [
  {
    node_id: "pdc-mainnet",
    node_name: "Pacific Data Commons",
    node_type: "data_registry",
    status: "live_mainnet",
    base_url: "https://api.synergybcpacific.com",
    discovery_url: "https://api.synergybcpacific.com/.well-known/x402-directory.json",
    cbs_read_access: true,
    compliance_monitored: true,
  },
  {
    node_id: "omw-pilot",
    node_name: "One Maritime Window",
    node_type: "maritime_single_window",
    status: "live_in_test",
    base_url: null,
    discovery_url: null,
    cbs_read_access: true,
    compliance_monitored: true,
  },
  {
    node_id: "dbs-lms",
    node_name: "DBS Sovereign Loan Management System",
    node_type: "financial_infrastructure",
    status: "tender_submitted",
    base_url: null,
    discovery_url: null,
    cbs_read_access: true,
    compliance_monitored: true,
  },
  {
    node_id: "payshield",
    node_name: "PayShield",
    node_type: "workforce_financial_inclusion",
    status: "built_pilot_ready",
    base_url: null,
    discovery_url: null,
    cbs_read_access: true,
    compliance_monitored: true,
  },
  {
    node_id: "auditshield",
    node_name: "AuditShield",
    node_type: "security_audit_service",
    status: "in_active_build",
    base_url: null,
    discovery_url: null,
    cbs_read_access: false,
    compliance_monitored: true,
  },
  {
    node_id: "pacific-content-rail",
    node_name: "Pacific Content Monetisation Rail",
    node_type: "content_platform",
    status: "phase_2_confidential",
    base_url: null,
    discovery_url: null,
    cbs_read_access: true,
    compliance_monitored: true,
  },
  {
    node_id: "pacific-education-commons",
    node_name: "Pacific Education Commons",
    node_type: "education_platform",
    status: "phase_2_confidential",
    base_url: null,
    discovery_url: null,
    cbs_read_access: true,
    compliance_monitored: true,
  },
  {
    node_id: "pacific-commerce-node",
    node_name: "Pacific Commerce Node",
    node_type: "ecommerce_platform",
    status: "phase_3_concept",
    base_url: null,
    discovery_url: null,
    cbs_read_access: true,
    compliance_monitored: true,
  },
];
