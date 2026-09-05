/**
 * Session 35 — Pacific Service Registry (PSR) v1.0.0.
 *
 * These constants must stay byte-identical to the canonical static files at
 * apps/web/public/psr/v1/spec.json and apps/web/public/psr/v1/endpoint-schema.json.
 *
 * apps/directory-api and apps/web are separate Railway services, each built
 * with its own `pnpm run build:<app>` (see each app's railway.json) — the
 * directory-api container never has apps/web/public on its filesystem at
 * runtime, so this route cannot read that file directly. Serving an inline
 * TS copy here matches the existing pattern in routes/discovery.ts (which
 * also builds its /.well-known/x402-directory.json response as an inline
 * object rather than reading a static file) instead of introducing a
 * cross-service file read or a build-time JSON-copy step for a single pair
 * of files. Update both copies together whenever the PSR spec changes.
 */

export const PSR_SPEC = {
  psr_version: "1.0.0",
  name: "Pacific Service Registry",
  description:
    "Machine-readable specification for discoverable, x402-payable Pacific data service endpoints. Operated by Synergy Blockchain Pacific Limited under the Pacific Data Commons platform.",
  operator: {
    name: "Synergy Blockchain Pacific Limited",
    country: "WS",
    contact: "anthony@synergybcpacific.com",
    website: "https://synergybcpacific.com",
  },
  network: "algorand-mainnet",
  payment_protocol: "x402",
  settlement_currency: "USDC",
  // Session 40 — directory-api migrated Railway -> Cloudflare Workers, but
  // api.synergybcpacific.com is the same public domain as before (DNS
  // repointed at the CF Worker post-merge, see MIGRATION.md).
  directory_endpoint: "https://api.synergybcpacific.com/search",
  discovery_file: "https://api.synergybcpacific.com/.well-known/x402-directory.json",
  // TODO(session40): apps/web is migrating Railway -> Cloudflare Pages.
  // Its production custom domain is not yet confirmed (see MIGRATION.md) —
  // update these two once Pages is live and DNS is assigned. Left as the
  // stale Railway URL rather than a guessed domain in the meantime.
  specification_url: "https://pdcweb-production.up.railway.app/psr/v1/spec.json",
  developer_docs: "https://pdcweb-production.up.railway.app/en/developers",
  endpoint_schema_version: "1.0.0",
  trust_tiers: ["bronze", "silver", "gold"],
  categories: [
    "fisheries", "climate", "trade", "demographics", "health",
    "agriculture", "cultural", "remittance", "legal", "geospatial",
    "energy", "carbon", "tourism", "disaster_risk", "biodiversity",
    "ocean", "education", "governance", "financial_flows", "research",
    "other",
  ],
  pricing: {
    directory_query_fee_usdc: 0.01,
    provider_share_pct: 97,
    sbp_share_pct: 3,
    bronze_tier_cap_usdc: 0.5,
  },
  interoperability: {
    model: "x-road-compatible",
    data_stays_at_source: true,
    sbp_holds_data: false,
    sbp_holds_funds: false,
  },
  published: "2026-08-28",
  next_review: "2027-01-01",
  // Session 38 — PSR multi-node registry extension. Appended fields only;
  // nothing above this point was altered (P6, publish-once format).
  ecosystem_summary: {
    total_nodes: 8,
    live_nodes: 3, // PDC, OMW (live in test), DBS LMS (tender)
    phase_2_nodes: 2, // PCMR, PEC
    phase_3_nodes: 1, // PCN
    stub_nodes: 2, // PayShield, AuditShield
    sbp_fee_pct_all_nodes: 3,
    settlement_currency: "USDC",
    settlement_network: "algorand-mainnet",
    registry_version: "1.1.0",
  },
  platform_nodes: [
    {
      node_id: "pdc-mainnet",
      node_name: "Pacific Data Commons",
      node_type: "data_registry",
      description:
        "Sovereign data marketplace. Pacific institutions list data endpoints. x402 micropayments per query. Reference implementation of the Pacific Service Registry.",
      status: "live_mainnet",
      adb_category: "Sovereign Data Economy",
      base_url: "https://api.synergybcpacific.com",
      discovery_url: "https://api.synergybcpacific.com/.well-known/x402-directory.json",
      psr_spec_url: "https://api.synergybcpacific.com/psr/v1/spec",
      nodes_url: "https://api.synergybcpacific.com/psr/v1/nodes",
      payment_protocol: "x402",
      settlement: "USDC_algorand_mainnet",
      sbp_fee_pct: 3,
      provider_fee_pct: 97,
      cbs_read_access: true,
      compliance_monitored: true,
    },
    {
      node_id: "omw-pilot",
      node_name: "One Maritime Window",
      node_type: "maritime_single_window",
      description:
        "Pacific's only blockchain-native Maritime Single Window. Five-agency parallel clearance. IMO FAL 2024 aligned. 83 automated tests passing.",
      status: "live_in_test",
      adb_category: "Digital Trade Infrastructure",
      imo_fal_2024_compliant: true,
      agency_nodes: ["customs_mor", "maf_biosecurity", "port_health", "shipping_agent_portal", "immigration"],
      blockchain_certificate_type: "PORT_CLEARED",
      certificate_verification: "QR-verifiable on Algorand Mainnet",
      base_url: null,
      payment_protocol: "invoice",
      sbp_fee_pct: 3,
      provider_fee_pct: 97,
      cbs_read_access: true,
      compliance_monitored: true,
    },
    {
      node_id: "dbs-lms",
      node_name: "DBS Sovereign Loan Management System",
      node_type: "financial_infrastructure",
      description:
        "Complete loan management system for Development Bank of Samoa. CBS live read-only integration. General Ledger. Citizen mobile app. Donor portal for ADB real-time monitoring.",
      status: "tender_submitted",
      adb_category: "Digital Financial Infrastructure",
      integrations: [
        { name: "CBS read-only portal", type: "regulatory_oversight", status: "live" },
        { name: "Donor portal (ADB)", type: "monitoring", status: "live" },
        { name: "General Ledger", type: "fiscal_transparency", status: "live" },
        { name: "MAF Fisheries stub", type: "agricultural_node", status: "stub" },
        { name: "Citizen mobile app", type: "e_governance", status: "live" },
      ],
      base_url: null,
      payment_protocol: "invoice",
      cbs_read_access: true,
      compliance_monitored: true,
    },
    {
      node_id: "payshield",
      node_name: "PayShield",
      node_type: "workforce_financial_inclusion",
      description:
        "Workforce management and financial inclusion for dispersed, unbanked Pacific workers. GPS validation. IoT security. Blockchain payroll in USDC.",
      status: "built_pilot_ready",
      adb_category: "Financial Inclusion",
      payment_protocol: "USDC_algorand_mainnet",
      sbp_fee_pct: 3,
      provider_fee_pct: 97,
      cbs_read_access: true,
      compliance_monitored: true,
    },
    {
      node_id: "auditshield",
      node_name: "AuditShield",
      node_type: "security_audit_service",
      description: "AI-augmented smart contract audit. Four-pass Claude API pipeline. Slither, Aderyn, Mythril. Regional and international market.",
      status: "in_active_build",
      adb_category: "AI Readiness and Cybersecurity",
      payment_protocol: "invoice_usdc",
      cbs_read_access: false,
      compliance_monitored: true,
    },
    {
      node_id: "pacific-content-rail",
      node_name: "Pacific Content Monetisation Rail",
      node_type: "content_platform",
      description:
        "Pacific creators receive micropayments per view, per stream-minute, or via tip. No bank account required. Community sovereignty layer for indigenous content.",
      status: "phase_2_confidential",
      payment_protocol: "x402",
      settlement: "USDC_algorand_mainnet",
      sbp_fee_pct: 3,
      provider_fee_pct: 97,
      base_url: null,
      cbs_read_access: true,
      compliance_monitored: true,
    },
    {
      node_id: "pacific-education-commons",
      node_name: "Pacific Education Commons",
      node_type: "education_platform",
      description: "Grant-funded open education. Courses, micro-credentials, on-chain completion credentials. Grant wallets pay on behalf of learners in sponsored programmes.",
      status: "phase_2_confidential",
      payment_protocol: "x402",
      settlement: "USDC_algorand_mainnet",
      sbp_fee_pct: 3,
      provider_fee_pct: 97,
      base_url: null,
      cbs_read_access: true,
      compliance_monitored: true,
    },
    {
      node_id: "pacific-commerce-node",
      node_name: "Pacific Commerce Node",
      node_type: "ecommerce_platform",
      description: "x402-native e-commerce for Pacific businesses. Goods and services. Immediate USDC settlement. Completes the SBP circular economy.",
      status: "phase_3_concept",
      payment_protocol: "x402",
      settlement: "USDC_algorand_mainnet",
      sbp_fee_pct: 3,
      provider_fee_pct: 97,
      base_url: null,
      cbs_read_access: true,
      compliance_monitored: true,
    },
  ],
} as const;

export const PSR_ENDPOINT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  // TODO(session40): same pdcweb domain-TBD note as specification_url above.
  $id: "https://pdcweb-production.up.railway.app/psr/v1/endpoint-schema.json",
  title: "Pacific Service Registry — Endpoint Registration Schema",
  description:
    "Defines a valid PSR-compatible endpoint registration. Mirrors the `endpoints` table in the Pacific Data Commons reference implementation (packages/shared-types/src/endpoints.ts). Fields marked reserved exist in the schema for forward compatibility but carry no enforcement logic yet.",
  psr_version: "1.0.0",
  endpoint_schema_version: "1.0.0",
  type: "object",
  required: [
    "endpoint_id",
    "provider_id",
    "name",
    "description",
    "category",
    "price_usdc",
    "trust_tier",
    "payment_address",
    "url",
    "method",
  ],
  properties: {
    endpoint_id: { type: "string", format: "uuid", required: true, description: "Unique identifier for the endpoint. Maps to endpoints.id." },
    provider_id: {
      type: "string",
      format: "uuid",
      required: true,
      description: "Identifier of the registered provider institution that owns this endpoint. Maps to endpoints.provider_id, foreign key to providers.id.",
    },
    name: { type: "string", required: true, description: "Human-readable endpoint name. Maps to endpoints.title." },
    description: { type: "string", required: true, description: "Plain-language description of what this endpoint provides. Maps to endpoints.description." },
    category: {
      type: "string",
      required: true,
      enum: [
        "fisheries", "climate", "trade", "demographics", "health",
        "agriculture", "cultural", "remittance", "legal", "geospatial",
        "energy", "carbon", "tourism", "disaster_risk", "biodiversity",
        "ocean", "education", "governance", "financial_flows", "research",
        "other",
      ],
      description: "Primary data category. Maps to endpoints.data_category. Must stay in sync with the DATA_CATEGORIES constant in the PDC reference implementation.",
    },
    data_sub_category: { type: ["string", "null"], required: false, description: "Optional free-text sub-category refinement. Maps to endpoints.data_sub_category." },
    price_usdc: {
      type: "number",
      minimum: 0,
      required: true,
      description: "Price in USDC for the endpoint's base tier. Maps to the 'tier 1' entry of endpoints.pricing_tiers[]. A PSR-compatible endpoint may expose multiple pricing_tiers (1-5); price_usdc here refers to the lowest tier.",
    },
    trust_tier: {
      type: "string",
      required: true,
      enum: ["bronze", "silver", "gold"],
      description:
        "Current trust tier. Bronze: identity verified only, capped at bronze_tier_cap_usdc unless verified_government/verified_commercial. Silver: 3 verified purchaser upvotes. Gold: documented peer review, clerically checked by SBP.",
    },
    payment_address: {
      type: "string",
      required: true,
      description: "Algorand wallet address that receives the provider's 97% share of every settled query. Never an SBP-controlled address (P2 — SBP never holds funds).",
    },
    url: { type: "string", format: "uri", required: true, description: "Base URL of the live endpoint. Maps to endpoints.endpoint_url." },
    method: {
      type: "string",
      required: true,
      enum: ["GET", "POST", "HEAD", "DELETE", "PUT", "PATCH"],
      description: "HTTP method the endpoint responds to for its priced query.",
    },
    health_check_url: { type: ["string", "null"], format: "uri", required: false, description: "URL polled by the PDC health-check cron. Maps to endpoints.health_check_url." },
    integrity_url: {
      type: ["string", "null"],
      format: "uri",
      required: false,
      description: "URL returning the current dataset content hash for buyer verification (certificate v1.1 /integrity route). Maps to endpoints.integrity_url.",
    },
    geography_country: { type: ["array", "null"], items: { type: "string" }, required: false, description: "ISO 3166-1 alpha-2 country codes the data covers. Maps to endpoints.geography_country." },
    geography_region: { type: ["string", "null"], required: false, description: "Free-text regional descriptor (e.g. 'Pacific-wide', 'Melanesia'). Maps to endpoints.geography_region." },
    time_period_start: { type: ["integer", "null"], required: false, description: "Earliest year covered by the dataset. Maps to endpoints.time_period_start." },
    time_period_end: { type: ["integer", "null"], required: false, description: "Latest year covered by the dataset. Maps to endpoints.time_period_end." },
    update_frequency: {
      type: ["string", "null"],
      enum: ["real-time", "daily", "monthly", "annual", "static", "irregular", null],
      required: false,
      description: "How often the underlying dataset is refreshed. Maps to endpoints.update_frequency.",
    },
    agent_reuse_policy: {
      type: "string",
      enum: ["per_run", "ttl_cache", "unrestricted"],
      default: "ttl_cache",
      required: false,
      description:
        "Decision 34 — provider-configured caching policy. per_run: agents must query fresh every run. ttl_cache: agents may cache for cache_ttl_seconds (default 24h). unrestricted: agents may cache indefinitely for genuinely static datasets. Maps to endpoints.agent_reuse_policy.",
    },
    cache_ttl_seconds: {
      type: "integer",
      default: 86400,
      required: false,
      description: "TTL in seconds an agent may cache a response when agent_reuse_policy is ttl_cache. Maps to endpoints.cache_ttl_seconds.",
    },
    indigenous_data_flag: {
      type: "boolean",
      required: true,
      description:
        "Mandatory sovereignty field. True if the dataset contains indigenous data subject to sovereignty protections. Agents that ignore this flag are de-listable (Section 19). Maps to endpoints.indigenous_data_flag.",
    },
    cultural_sensitivity: {
      type: "string",
      required: true,
      enum: ["none", "low", "medium", "high"],
      description: "Mandatory sovereignty field. Cultural sensitivity classification of the dataset. Maps to endpoints.cultural_sensitivity.",
    },
    cultural_sovereignty_price_floor: {
      type: ["number", "null"],
      required: false,
      reserved: true,
      description:
        "RESERVED (Decisions 39, 51). Provider-set minimum price for cultural data endpoints. Schema field only — no enforcement logic exists yet (Phase 2). Maps to endpoints.cultural_sovereignty_price_floor.",
    },
    sovereignty_framework: {
      type: ["string", "null"],
      required: false,
      description: "Free-text reference to the governance framework under which sovereignty flags on this endpoint were set. Maps to endpoints.sovereignty_framework.",
    },
    permitted_use_cases: {
      type: "array",
      items: { type: "string" },
      required: false,
      description: "Enumerated permitted use cases for this endpoint's data. Buyer ToS permitted-use clause is derived from this field. Maps to endpoints.permitted_use_cases.",
    },
    attribution_required: {
      type: "boolean",
      required: false,
      description: "Whether buyers must attribute the source institution when using this data. Maps to endpoints.attribution_required.",
    },
    attribution_format: {
      type: ["string", "null"],
      required: false,
      description: "Required citation/attribution format text, if attribution_required is true. Maps to endpoints.attribution_format.",
    },
    commercial_licence_req: {
      type: "boolean",
      required: false,
      description: "Whether commercial use of this endpoint's data requires a separate licence from the provider. Maps to endpoints.commercial_licence_req.",
    },
    traditional_knowledge: {
      type: "boolean",
      required: false,
      description: "True if the dataset encodes traditional/customary knowledge. Maps to endpoints.traditional_knowledge.",
    },
    certificate_id: {
      type: ["string", "null"],
      format: "uuid",
      required: false,
      description:
        "Reference to the active provenance certificate for this endpoint (provenance_certificates table). Not a column on endpoints itself — included here as the field a PSR consumer needs to look up certificate details.",
    },
    dataset_content_hash: {
      type: ["string", "null"],
      required: false,
      description:
        "Cached SHA-256 hash of the current dataset, matching the active certificate's dataset_content_hash (certificate v1.1, canonical serialisation rule, CLAUDE.md Section 10). Maps to endpoints.dataset_content_hash. Source of truth remains provenance_certificates.",
    },
    version_number: { type: "integer", default: 1, required: false, description: "Current declared version number of the dataset (Decision 54). Maps to endpoints.version_number." },
    pending_recertification: {
      type: "boolean",
      default: false,
      required: false,
      description: "True during the 7-day post-update window where integrity checks are bypassed pending recertification (Decision 54). Maps to endpoints.pending_recertification.",
    },
    competition_tag: { type: "string", required: false, description: "Tag applied to endpoints participating in the x402 Global Challenge. Maps to endpoints.competition_tag." },
    is_active: { type: "boolean", default: true, required: false, description: "Whether the endpoint is currently listed and queryable. Maps to endpoints.is_active." },
  },
} as const;
