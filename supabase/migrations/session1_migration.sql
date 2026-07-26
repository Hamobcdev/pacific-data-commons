-- ============================================================================
-- Pacific Data Commons — Session 1 Migration
-- Synergy Blockchain Pacific (SBP)
-- Authoritative source: CLAUDE.md v2.1 (Section 5 — 31 confirmed decisions,
-- Section 12 — Part 3 errata). Where this file and Part 3 architecture docs
-- conflict, CLAUDE.md v2.1 wins; this file already applies those corrections:
--   1. providers.sbp_fee_pct DEFAULT 3 / provider_pct DEFAULT 97 (97/3 split)
--   2. No jurisdiction field anywhere in PDC tables (providers, endpoints,
--      transactions_log) — jurisdiction exists only in OGIP tables
--   3. No national_fund_pct in providers — fund contribution is OGIP-only
--      (ogip_ministries.fund_pct)
--   4. community_ratings.rating_channel distinguishes wallet_api (primary)
--      from email_prompt (secondary)
--   5. providers.fee_collection_consent is a provider-set consent flag —
--      not a wallet pull/sweep authorisation (P2: SBP never holds funds)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- DOMAIN 6 (created first — no dependencies) — OGIP JURISDICTIONS
-- ============================================================================

CREATE TABLE ogip_jurisdictions (
  code                  TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  jurisdiction_type     TEXT NOT NULL CHECK (jurisdiction_type IN (
                          'nation', 'regional', 'intergovernmental'
                        )),
  fund_wallet_address   TEXT,
  ogip_active           BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- DOMAIN 1 — PDC PROVIDERS AND ENDPOINTS
-- ============================================================================

CREATE TABLE providers (
  -- Identity
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_name          TEXT NOT NULL,
  institution_type          TEXT NOT NULL CHECK (institution_type IN (
                              'university', 'government', 'ngo',
                              'private', 'cultural', 'intergovernmental'
                            )),
  provider_track            TEXT NOT NULL DEFAULT 'international' CHECK (provider_track IN (
                              'international', 'ogip_government'
                            )),
  country                   TEXT NOT NULL,
  verified_domain           TEXT,
  contact_email             TEXT NOT NULL UNIQUE,
  contact_name              TEXT,

  -- Algorand wallet
  wallet_address            TEXT,
  usdc_opted_in             BOOLEAN DEFAULT FALSE,
  wallet_verified_at        TIMESTAMP WITH TIME ZONE,

  -- Trust tier
  trust_tier                TEXT DEFAULT 'bronze' CHECK (trust_tier IN (
                              'bronze', 'silver', 'gold'
                            )),
  verified_government       BOOLEAN DEFAULT FALSE,
  -- verified_government = TRUE bypasses Bronze price cap
  -- Set only for OGIP government track providers with Cabinet approval

  -- Revenue split (PDC international: 97/3 — Decision 11. OGIP government: configurable)
  provider_pct              DECIMAL DEFAULT 97 CHECK (provider_pct BETWEEN 0 AND 100),
  sbp_fee_pct               DECIMAL DEFAULT 3 CHECK (sbp_fee_pct BETWEEN 0 AND 100),
  -- Note: provider_pct + sbp_fee_pct must = 100 for international track
  -- For OGIP government track: provider_pct + fund_pct + sbp_fee_pct = 100
  -- fund_pct is stored in ogip_ministries, not here (Decision 20 — no fund
  -- contribution in the PDC international layer)

  -- SBP fee collection (Tier 1-2 monthly settlement — Decision 31)
  -- Provider initiates settlement via dashboard — SBP never pulls from wallet
  fee_collection_consent    BOOLEAN DEFAULT FALSE,
  -- Provider must set this TRUE during onboarding before going live
  tier12_earnings_accrued   DECIMAL DEFAULT 0,
  -- Running total of Tier 1-2 earnings not yet invoiced
  -- Resets to 0 after each monthly settlement
  fee_threshold_usdc        DECIMAL DEFAULT 10.00,
  -- Minimum accrued amount before invoice is generated (default $10)
  last_fee_settled_at       TIMESTAMP WITH TIME ZONE,
  fee_settlement_due_at     TIMESTAMP WITH TIME ZONE,
  -- Set when threshold crossed, settlement expected within 7 days

  -- Onboarding state
  onboarding_status         TEXT DEFAULT 'registered' CHECK (onboarding_status IN (
                              'registered', 'wallet_setup', 'verification_pending',
                              'verified', 'active', 'suspended', 'inactive'
                            )),
  onboarding_started_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  went_live_at              TIMESTAMP WITH TIME ZONE,

  -- Directory listing status
  is_active                 BOOLEAN DEFAULT FALSE,
  suspended_reason          TEXT,
  suspended_at              TIMESTAMP WITH TIME ZONE,

  -- Analytics (denormalised for dashboard performance)
  total_queries_served      BIGINT DEFAULT 0,
  total_revenue_usdc        DECIMAL DEFAULT 0,
  last_query_at             TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE endpoints (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id               UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

  -- Endpoint location (on provider's own infrastructure)
  endpoint_url              TEXT,
  -- NULL until provider deploys — onboarding tracks this
  health_check_url          TEXT,
  -- Typically endpoint_url + '/health'
  integrity_url             TEXT,
  -- Required for v1.1 certs: endpoint_url + '/integrity'
  -- Returns current dataset SHA-256 hash using canonical serialisation rule

  -- Data description
  data_category             TEXT NOT NULL CHECK (data_category IN (
                              'fisheries', 'climate', 'trade', 'demographics',
                              'health', 'agriculture', 'cultural', 'remittance',
                              'legal', 'geospatial', 'energy', 'carbon',
                              'tourism', 'disaster_risk', 'biodiversity',
                              'ocean', 'education', 'other'
                            )),
  data_sub_category         TEXT,
  title                     TEXT NOT NULL,
  description               TEXT NOT NULL,
  -- Agent-readable: specific about what the caller receives, not just the topic

  -- Geographic coverage
  geography_country         TEXT[],
  geography_region          TEXT,
  geography_geojson         JSONB,

  -- Temporal coverage
  time_period_start         INTEGER,
  time_period_end           INTEGER,
  update_frequency          TEXT CHECK (update_frequency IN (
                              'real-time', 'daily', 'monthly',
                              'annual', 'static', 'irregular'
                            )),

  -- Data specification
  spatial_resolution        TEXT,
  data_format               TEXT DEFAULT 'pdp-1.0',
  languages                 TEXT[] DEFAULT ARRAY['English'],
  sample_size               TEXT,

  -- Data classification (government track only — NULL for international)
  sensitivity_level         TEXT CHECK (sensitivity_level IN (
                              'public', 'internal', 'restricted', 'classified'
                            )),
  personal_data_flag        TEXT CHECK (personal_data_flag IN (
                              'non_personal', 'anonymised',
                              'pseudonymised', 'personal'
                            )),
  commercial_eligibility    TEXT CHECK (commercial_eligibility IN (
                              'fully_commercial', 'research_only',
                              'government_only', 'community_consent'
                            )),

  -- Pricing tiers (JSONB array of tier objects)
  -- Structure: [{tier: 1, name: "Summary", price_usdc: 0.01, path: "/summary"}, ...]
  pricing_tiers             JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Bronze price cap enforcement (Decision 23)
  -- Bronze providers: Tier 1-2 only (max $0.50) unless verified_government
  -- Enforced at directory listing level — endpoint template also enforces
  max_tier_at_bronze        INTEGER DEFAULT 2,
  -- Automatically updated to 5 when provider reaches Silver

  -- Buyer-facing content
  sample_response           JSONB,
  query_parameters          JSONB,
  -- Accepted filter parameters for slice queries
  rate_limit                TEXT DEFAULT '100 per hour',
  response_time_sla         TEXT DEFAULT '2s',

  -- Sovereignty fields (mandatory for all endpoints)
  indigenous_data_flag      BOOLEAN DEFAULT FALSE,
  cultural_sensitivity      TEXT DEFAULT 'none' CHECK (cultural_sensitivity IN (
                              'none', 'low', 'medium', 'high'
                            )),
  sovereignty_framework     TEXT,
  permitted_use_cases       TEXT[] DEFAULT ARRAY['commercial', 'research', 'government'],
  attribution_required      BOOLEAN DEFAULT TRUE,
  attribution_format        TEXT,
  commercial_licence_req    BOOLEAN DEFAULT FALSE,
  donor_conditions          TEXT,
  -- Discloses any open-access conditions on underlying research
  community_consent_doc     TEXT,
  traditional_knowledge     BOOLEAN DEFAULT FALSE,

  -- Competition tag (mandatory for all PDC endpoints during competition)
  competition_tag           TEXT DEFAULT 'x402-global-challenge',
  bazaar_registered         BOOLEAN DEFAULT FALSE,
  bazaar_registered_at      TIMESTAMP WITH TIME ZONE,

  -- Skills files (both formats generated per endpoint)
  skills_file_agentmarket   JSONB,
  skills_file_pdp           JSONB,
  skills_file_url           TEXT,

  -- Health monitoring
  health_status             TEXT DEFAULT 'unknown' CHECK (health_status IN (
                              'healthy', 'degraded', 'down', 'unknown'
                            )),
  last_health_check_at      TIMESTAMP WITH TIME ZONE,
  consecutive_health_fails  INTEGER DEFAULT 0,
  -- Auto-degrade at 3 consecutive fails, auto-delist at threshold

  -- Analytics
  total_queries             BIGINT DEFAULT 0,
  total_revenue_usdc        DECIMAL DEFAULT 0,
  last_queried_at           TIMESTAMP WITH TIME ZONE,

  -- Status
  is_active                 BOOLEAN DEFAULT FALSE,
  paused_reason             TEXT,
  -- 'dispute_flags' | 'health_failure' | 'fee_unpaid' | 'provider_request'
  paused_at                 TIMESTAMP WITH TIME ZONE,

  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- DOMAIN 2 — TRUST AND PROVENANCE
-- ============================================================================

CREATE TABLE provenance_certificates (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id                     UUID NOT NULL REFERENCES providers(id),
  endpoint_id                     UUID NOT NULL REFERENCES endpoints(id),

  -- On-chain reference
  algo_asset_id                   TEXT,
  -- Algorand ASA ID — set after minting
  cert_hash                       TEXT NOT NULL,
  -- SHA-256 of cert_json (without algo_asset_id and cert_hash fields)

  -- Dataset content hash (v1.1 requirement)
  dataset_content_hash            TEXT,
  -- SHA-256 of dataset using canonical serialisation rule:
  -- JSON: keys sorted alphabetically, no whitespace, UTF-8
  -- CSV: UTF-8, LF line endings, header included, no trailing newline
  -- Binary: SHA-256 of raw bytes
  -- This hash must match what the /integrity route returns

  -- Full certificate content (stored off-chain, hash on-chain)
  cert_json                       JSONB NOT NULL,

  -- Trust tier at time of issuance
  trust_tier                      TEXT NOT NULL CHECK (trust_tier IN (
                                    'bronze', 'silver', 'gold'
                                  )),

  -- Verification checklist
  domain_verified                 BOOLEAN DEFAULT FALSE,
  wallet_verified                 BOOLEAN DEFAULT FALSE,
  registry_verified               BOOLEAN DEFAULT FALSE,
  -- Institution appears in official registry
  methodology_verified            BOOLEAN DEFAULT FALSE,
  -- Silver+: methodology documented and reviewed
  llm_consistency_passed          BOOLEAN DEFAULT FALSE,
  -- Silver+: LLM consistency check passed (pipeline Call 5)
  researcher_credentials_verified BOOLEAN DEFAULT FALSE,
  -- Gold: ORCID or equivalent verified
  peer_reviewed                   BOOLEAN DEFAULT FALSE,
  peer_review_venue               TEXT,
  doi_verified                    BOOLEAN DEFAULT FALSE,
  doi                             TEXT,
  spot_check_passed               BOOLEAN DEFAULT FALSE,
  -- Gold: SBP spot-check of data content
  coi_declaration_submitted       BOOLEAN DEFAULT FALSE,
  coi_declaration_hash            TEXT,
  -- SHA-256 of the COI declaration text (provider wallet signs this)
  coi_declaration_url             TEXT,
  -- Public URL where full COI declaration is readable

  -- Government track additional checks
  cabinet_approval_verified       BOOLEAN DEFAULT FALSE,
  export_clearance_confirmed      BOOLEAN DEFAULT FALSE,

  -- Lifecycle
  status                          TEXT DEFAULT 'pending' CHECK (status IN (
                                    'pending', 'active', 'expired', 'revoked', 'suspended'
                                  )),
  issued_at                       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at                      TIMESTAMP WITH TIME ZONE,
  -- Set to issued_at + 1 year
  renewed_at                      TIMESTAMP WITH TIME ZONE,
  revoked_at                      TIMESTAMP WITH TIME ZONE,
  revocation_reason               TEXT,
  -- Must be one of the 6 exhaustive revocation grounds
  revocation_investigation_id     UUID,

  issued_by                       TEXT DEFAULT 'Synergy Blockchain Pacific',
  created_at                      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE verification_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       UUID NOT NULL REFERENCES providers(id),
  endpoint_id       UUID REFERENCES endpoints(id),
  queue_type        TEXT NOT NULL CHECK (queue_type IN (
                      'new_provider', 'trust_upgrade',
                      'renewal', 'spot_check', 'revocation_investigation'
                    )),
  target_tier       TEXT CHECK (target_tier IN ('bronze', 'silver', 'gold')),

  -- Automated check results (run before human review)
  automated_checks  JSONB DEFAULT '{}'::JSONB,
  -- {domain_check: pass/fail, wallet_check: pass/fail,
  --  registry_check: pass/fail, orcid_check: pass/fail,
  --  doi_check: pass/fail, llm_consistency: pass/fail/score}
  automated_at      TIMESTAMP WITH TIME ZONE,

  -- Human review
  assigned_to       TEXT,
  -- SBP reviewer identifier
  reviewer_notes    TEXT,
  status            TEXT DEFAULT 'queued' CHECK (status IN (
                      'queued', 'automated_running', 'awaiting_review',
                      'in_review', 'approved', 'rejected', 'more_info_needed'
                    )),

  submitted_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at      TIMESTAMP WITH TIME ZONE
);

CREATE TABLE community_ratings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id           UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  provider_id           UUID NOT NULL REFERENCES providers(id),

  -- Rater identity (wallet-based — primary channel)
  rater_wallet_address  TEXT NOT NULL,
  -- Must match wallet that paid for a query on this endpoint

  -- Proof of purchase (required for rating to count)
  query_tx_id           TEXT NOT NULL,
  -- Algorand transaction ID proving the rater paid for a query
  query_verified        BOOLEAN DEFAULT FALSE,
  -- Set TRUE after on-chain verification of query_tx_id

  -- Rating
  rating                TEXT NOT NULL CHECK (rating IN ('positive', 'negative')),
  rating_channel        TEXT NOT NULL DEFAULT 'wallet_api' CHECK (rating_channel IN (
                          'wallet_api',
                          -- Primary: wallet-signed API call (agents use this)
                          'email_prompt'
                          -- Secondary: email-prompted (human buyers only)
                        )),

  -- Wallet signature verification (primary channel)
  signed_message        TEXT,
  -- The message that was signed
  signature             TEXT,
  -- Base64 encoded Algorand signature

  -- For email channel (secondary)
  rater_email           TEXT,
  email_token           TEXT,
  -- One-time token from rating invitation email

  -- Anti-gaming
  -- One rating per wallet per endpoint — enforced by unique constraint below
  -- Rate limit: one rating per wallet per endpoint per 30 days
  -- (handled at application layer + this table)

  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique: one rating per wallet per endpoint
  UNIQUE (endpoint_id, rater_wallet_address)
);

CREATE TABLE dispute_flags (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id           UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  provider_id           UUID NOT NULL REFERENCES providers(id),

  -- Flagger identity
  flagger_wallet        TEXT NOT NULL,
  -- Must be a verified buyer wallet (has made a paid query)
  flagger_query_tx_id   TEXT NOT NULL,
  -- Proof that flagger paid for a query on this endpoint

  -- Dispute details
  dispute_description   TEXT NOT NULL,
  dispute_category      TEXT CHECK (dispute_category IN (
                          'data_quality', 'data_mismatch',
                          'access_issue', 'pricing_dispute',
                          'other'
                        )),

  -- Resolution
  status                TEXT DEFAULT 'open' CHECK (status IN (
                          'open', 'provider_notified',
                          'resolved', 'withdrawn'
                        )),
  resolved_at           TIMESTAMP WITH TIME ZONE,
  resolution_note       TEXT,

  -- Rate limiting: one flag per wallet per endpoint per 30 days
  -- Enforced by unique constraint on (endpoint_id, flagger_wallet)
  -- with a partial index for active flags within 30-day window

  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent same wallet flagging same endpoint more than once
  UNIQUE (endpoint_id, flagger_wallet)
);

-- ============================================================================
-- DOMAIN 3 — TRANSACTIONS AND REVENUE
-- ============================================================================

CREATE TABLE transactions_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Transaction type
  transaction_type      TEXT NOT NULL CHECK (transaction_type IN (
                          'directory_query',
                          -- Buyer queries SBP directory ($0.01)
                          'data_query_tier1',
                          -- Provider endpoint Tier 1 ($0.01)
                          'data_query_tier2',
                          -- Provider endpoint Tier 2 (up to $0.50)
                          'data_query_tier3',
                          -- Provider endpoint Tier 3 ($25)
                          'data_query_tier4',
                          -- Provider endpoint Tier 4 ($200)
                          'data_query_tier5',
                          -- Provider endpoint Tier 5 ($1000+, manual POC)
                          'sbp_fee_invoice',
                          -- Monthly SBP 3% fee on Tier 1-2 earnings
                          'pipeline_fee',
                          -- Optional formatting pipeline fee ($25)
                          'trust_upgrade_fee'
                          -- Silver ($25) or Gold ($100) upgrade fee
                        )),

  -- Parties
  provider_id           UUID REFERENCES providers(id),
  endpoint_id           UUID REFERENCES endpoints(id),

  -- Payment details
  algo_tx_id            TEXT,
  -- Algorand transaction ID — NULL for manual/invoice transactions
  amount_usdc           DECIMAL NOT NULL,
  pricing_tier          INTEGER,
  -- 1-5 for data queries, NULL for fees

  -- Split details (Tier 3-5 in-flow split only)
  provider_amount       DECIMAL,
  -- 97% of amount_usdc for international, 75% for OGIP government (default)
  sbp_fee_amount        DECIMAL,
  -- 3% of amount_usdc
  split_executed        BOOLEAN DEFAULT FALSE,
  split_tx_id           TEXT,
  -- Transaction ID of the split execution

  -- For Tier 1-2: no split — provider receives 100%
  -- SBP fee accrues on providers.tier12_earnings_accrued
  -- and is settled monthly when threshold ($10) is reached

  -- Buyer details
  buyer_wallet_address  TEXT,
  buyer_country         TEXT,
  -- Anonymised after 90 days
  anonymised_at         TIMESTAMP WITH TIME ZONE,

  -- Query metadata (what was queried — not the response data)
  query_parameters      JSONB,
  response_tier         TEXT,
  response_time_ms      INTEGER,

  -- Timestamps
  queried_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sbp_fee_invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           UUID NOT NULL REFERENCES providers(id),

  -- Invoice details
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  tier12_revenue_total  DECIMAL NOT NULL,
  -- Total Tier 1-2 earnings in the period
  sbp_fee_rate          DECIMAL NOT NULL DEFAULT 0.03,
  -- 3%
  sbp_fee_amount        DECIMAL NOT NULL,
  -- tier12_revenue_total * sbp_fee_rate

  -- Status
  status                TEXT DEFAULT 'pending' CHECK (status IN (
                          'pending',
                          -- Below $10 threshold — rolling over
                          'due',
                          -- Threshold crossed — awaiting provider settlement
                          'notified',
                          -- 7-day notice sent to provider
                          'overdue',
                          -- 7 days elapsed without settlement
                          'paused',
                          -- Directory paused at day 21 — awaiting resolution
                          'settled',
                          -- Provider initiated settlement successfully
                          'disputed',
                          -- Provider raised a dispute about the calculation
                          'waived'
                          -- SBP waived (e.g. POC period, error correction)
                        )),

  -- Key dates
  threshold_crossed_at  TIMESTAMP WITH TIME ZONE,
  notice_sent_at        TIMESTAMP WITH TIME ZONE,
  due_by                TIMESTAMP WITH TIME ZONE,
  -- notice_sent_at + 7 days
  pause_at              TIMESTAMP WITH TIME ZONE,
  -- notice_sent_at + 21 days
  settled_at            TIMESTAMP WITH TIME ZONE,
  settlement_tx_id      TEXT,
  -- Algorand TX of provider-initiated settlement

  -- Rollover tracking
  rolled_over_from      UUID REFERENCES sbp_fee_invoices(id),
  -- If this invoice includes rolled-over amounts from prior period

  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- One invoice per provider per period — required for
  -- increment_tier12_accrual()'s ON CONFLICT DO NOTHING to have a target
  UNIQUE (provider_id, period_start, period_end)
);

-- ============================================================================
-- DOMAIN 4 — ONBOARDING PIPELINE
-- ============================================================================

CREATE TABLE uploaded_files (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           UUID NOT NULL REFERENCES providers(id),

  -- File details
  original_filename     TEXT NOT NULL,
  file_type             TEXT NOT NULL CHECK (file_type IN (
                          'pdf', 'pdf_scanned', 'xlsx', 'csv',
                          'docx', 'md', 'zip', 'other'
                        )),
  file_size_bytes       BIGINT,
  r2_key                TEXT NOT NULL,
  -- Cloudflare R2 object key — used to retrieve and delete

  -- Processing state
  processing_status     TEXT DEFAULT 'uploaded' CHECK (processing_status IN (
                          'uploaded', 'parsing', 'parsed',
                          'pipeline_queued', 'pipeline_running',
                          'pipeline_complete', 'failed', 'deleted'
                        )),
  parse_output          JSONB,
  -- Extracted text and tables from document parser
  parse_error           TEXT,

  -- File lifecycle — raw files must be deleted after processing + approval
  uploaded_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at          TIMESTAMP WITH TIME ZONE,
  approved_at           TIMESTAMP WITH TIME ZONE,
  deleted_at            TIMESTAMP WITH TIME ZONE
  -- Set when R2 object is deleted — NULL means file still exists
);

CREATE TABLE formatting_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           UUID NOT NULL REFERENCES providers(id),
  file_ids              UUID[],
  -- References to uploaded_files

  -- Pipeline stage outputs (saved for provider review)
  stage_classification  JSONB,
  -- Stage 2: data_category, sub_category, geography, time_period, quality_flags
  stage_schema_mapping  JSONB,
  -- Stage 3: PDP-compliant structured data
  stage_descriptions    JSONB,
  -- Stage 4: title, description per tier, agent-readable copy
  stage_pricing_rec     JSONB,
  -- Stage 5: recommended pricing per tier with justification
  stage_endpoint_config JSONB,
  -- Stage 6: pre-filled Hono server configuration
  stage_sample_response JSONB,
  -- Stage 7: redacted sample response + both skills files

  -- Provider review
  provider_approved     BOOLEAN,
  provider_edits        JSONB,
  -- What the provider changed during review
  approved_at           TIMESTAMP WITH TIME ZONE,

  -- Cost tracking
  api_tokens_input      INTEGER DEFAULT 0,
  api_tokens_output     INTEGER DEFAULT 0,
  api_cost_usd          DECIMAL DEFAULT 0,

  -- Pipeline fee (Decision 27)
  fee_amount_usdc       DECIMAL DEFAULT 25.00,
  fee_waived            BOOLEAN DEFAULT FALSE,
  -- TRUE for provider's first dataset
  fee_charged           BOOLEAN DEFAULT FALSE,
  -- Only set TRUE after provider approves output (Decision 27)
  fee_tx_id             TEXT,

  -- Status
  status                TEXT DEFAULT 'queued' CHECK (status IN (
                          'queued', 'parsing', 'stage2_classification',
                          'stage3_schema', 'stage4_descriptions',
                          'stage5_pricing', 'stage6_config',
                          'stage7_samples', 'awaiting_review',
                          'approved', 'rejected', 'failed'
                        )),
  error_message         TEXT,

  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at          TIMESTAMP WITH TIME ZONE
);

CREATE TABLE endpoint_deployments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id           UUID NOT NULL REFERENCES endpoints(id),
  provider_id           UUID NOT NULL REFERENCES providers(id),

  deployment_type       TEXT NOT NULL CHECK (deployment_type IN (
                          'railway_sbp_managed',
                          -- SBP manages during POC
                          'railway_provider',
                          -- Provider's own Railway account
                          'render_provider',
                          -- Provider's own Render account
                          'self_hosted'
                          -- Provider's own infrastructure
                        )),

  deployment_url        TEXT,
  railway_service_id    TEXT,
  render_service_id     TEXT,

  -- Deployment state
  status                TEXT DEFAULT 'pending' CHECK (status IN (
                          'pending', 'deploying', 'live',
                          'failed', 'paused', 'retired'
                        )),

  deployed_at           TIMESTAMP WITH TIME ZONE,
  retired_at            TIMESTAMP WITH TIME ZONE,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- DOMAIN 5 — SKILLS FILES AND AGENT DISCOVERY
-- ============================================================================

CREATE TABLE skills_files (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id                 UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  provider_id                 UUID NOT NULL REFERENCES providers(id),

  -- Both formats required (generated automatically during pipeline) — Decision 15
  agentmarket_skills_json     JSONB,
  -- Agent.market specification format for maximum immediate distribution
  pdp_skills_json             JSONB,
  -- Pacific Data Protocol format — establishes PDP as a standard

  -- Public URLs where files are served from the provider endpoint
  agentmarket_skills_url      TEXT,
  -- Typically endpoint_url + '/skills-agentmarket.json'
  pdp_skills_url              TEXT,
  -- Typically endpoint_url + '/skills-pdp.json'

  -- Registration status
  agentmarket_registered      BOOLEAN DEFAULT FALSE,
  bazaar_registered           BOOLEAN DEFAULT FALSE,

  -- Version tracking
  version                     TEXT DEFAULT '1.0',
  last_updated                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- DOMAIN 6 (continued) — OGIP MINIMAL PHASE 0 (Decision 12, Section 20)
-- Jurisdiction exists ONLY here and in the OGIP tables below (P3 / Decision 19)
-- ============================================================================

CREATE TABLE ogip_ministries (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code       TEXT NOT NULL REFERENCES ogip_jurisdictions(code),
  -- OGIP layer has jurisdiction — PDC layer does not

  ministry_name           TEXT NOT NULL,
  ministry_type           TEXT CHECK (ministry_type IN (
                            'statistics', 'finance', 'agriculture',
                            'health', 'environment', 'fisheries',
                            'education', 'trade', 'communications',
                            'central_bank', 'other'
                          )),
  contact_email           TEXT NOT NULL,
  data_officer_name       TEXT,
  data_officer_email      TEXT,

  -- Governance
  cabinet_approval_ref    TEXT,
  cabinet_approval_date   DATE,

  -- OGIP connection
  ogip_connected          BOOLEAN DEFAULT FALSE,
  ogip_connection_id      TEXT,
  ogip_connected_at       TIMESTAMP WITH TIME ZONE,

  -- Revenue configuration (OGIP government track — Decision 11b default 75/20/5)
  revenue_model           TEXT DEFAULT 'B' CHECK (revenue_model IN ('A', 'B', 'C')),
  -- A: 100% to ministry, B: 75/20/5 provider/fund/SBP, C: treasury
  provider_pct            DECIMAL DEFAULT 75,
  fund_pct                DECIMAL DEFAULT 20,
  sbp_pct                 DECIMAL DEFAULT 5,

  -- Status
  status                  TEXT DEFAULT 'registered' CHECK (status IN (
                            'registered', 'approval_pending', 'connected',
                            'active', 'suspended'
                          )),
  is_active               BOOLEAN DEFAULT FALSE,

  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE ogip_endpoints (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id           UUID NOT NULL REFERENCES ogip_ministries(id),
  jurisdiction_code     TEXT NOT NULL REFERENCES ogip_jurisdictions(code),
  -- Jurisdiction IS present on OGIP endpoints (unlike PDC endpoints)

  -- Internal OGIP route
  internal_ogip_url     TEXT,
  -- URL accessible within OGIP — ministry's infrastructure

  -- PDC listing (if commercially eligible)
  pdc_endpoint_id       UUID REFERENCES endpoints(id),
  -- Links to PDC endpoints table if this data is also listed internationally
  commercial_eligibility TEXT CHECK (commercial_eligibility IN (
                            'fully_commercial', 'research_only',
                            'government_only', 'community_consent'
                          )),

  -- Data description (mirrors PDC endpoints structure)
  data_category         TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL,

  -- Classification
  sensitivity_level     TEXT NOT NULL DEFAULT 'internal' CHECK (sensitivity_level IN (
                          'public', 'internal', 'restricted', 'classified'
                        )),
  personal_data_flag    TEXT DEFAULT 'non_personal',
  export_clearance      BOOLEAN DEFAULT FALSE,
  -- Ministry has confirmed clearance for international commercial release

  -- Pricing
  internal_price_wst    DECIMAL DEFAULT 0.01,
  -- WST amount per internal ministry-to-ministry query
  -- Non-monetary during POC (Decision 24) — recorded for future settlement

  is_active             BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE ogip_credit_ledger (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  providing_ministry_id     UUID NOT NULL REFERENCES ogip_ministries(id),
  requesting_ministry_id    UUID NOT NULL REFERENCES ogip_ministries(id),
  ogip_endpoint_id          UUID NOT NULL REFERENCES ogip_endpoints(id),
  jurisdiction_code         TEXT NOT NULL REFERENCES ogip_jurisdictions(code),

  -- Credit amount
  credit_amount_wst         DECIMAL NOT NULL,
  -- Recorded but not settled during POC (non-monetary contribution score)

  -- Query metadata
  query_timestamp           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Settlement tracking (Phase 2)
  settlement_period         TEXT,
  -- Format: "2026-08" (year-month)
  settled                   BOOLEAN DEFAULT FALSE,
  settled_at                TIMESTAMP WITH TIME ZONE,

  -- For Phase 0 POC: contribution_score is what matters
  -- This ledger functions as a performance metric, not a financial instrument
  -- WST settlement begins in Phase 2 once MoF agreement is in place
  is_monetary               BOOLEAN DEFAULT FALSE
  -- Always FALSE during POC Phase 0 — set TRUE in Phase 2 after MoF agreement
);

-- ============================================================================
-- DOMAIN 7 — PLATFORM OPERATIONS
-- ============================================================================

CREATE TABLE endpoint_health_checks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id           UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  checked_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status                TEXT NOT NULL CHECK (status IN (
                          'healthy', 'degraded', 'down'
                        )),
  response_time_ms      INTEGER,
  http_status_code      INTEGER,
  error_message         TEXT
  -- Retain last 30 days only — older records purged by Railway cron
);

CREATE TABLE certificate_revocation_investigations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_id               UUID NOT NULL REFERENCES provenance_certificates(id),
  provider_id           UUID NOT NULL REFERENCES providers(id),

  -- Complaint
  complainant_identity  TEXT NOT NULL,
  -- Anonymous complaints not accepted
  complainant_declaration TEXT NOT NULL,
  -- Sworn declaration from complainant
  complaint_category    TEXT CHECK (complaint_category IN (
                          'fraud', 'hash_mismatch', 'institution_dissolved',
                          'criminal_conviction', 'failed_recertification',
                          'community_consent_violation'
                        )),
  -- Only the 6 exhaustive grounds — no other grounds accepted

  -- Investigation timeline
  opened_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  provider_notified_at  TIMESTAMP WITH TIME ZONE,
  provider_response_due TIMESTAMP WITH TIME ZONE,
  -- opened_at + 30 days
  provider_response     TEXT,

  -- Decision
  status                TEXT DEFAULT 'open' CHECK (status IN (
                          'open', 'provider_notified', 'under_review',
                          'appeal_period', 'revoked', 'dismissed',
                          'suspended_pending'
                          -- Emergency: temporary suspension not revocation
                        )),
  decision              TEXT,
  decision_at           TIMESTAMP WITH TIME ZONE,
  appeal_deadline       TIMESTAMP WITH TIME ZONE,
  -- decision_at + 14 days

  -- Independent appeal panel (if appealed)
  appeal_submitted      BOOLEAN DEFAULT FALSE,
  appeal_outcome        TEXT,

  -- Buyer notification (on revocation)
  buyers_notified       BOOLEAN DEFAULT FALSE,
  buyers_notified_at    TIMESTAMP WITH TIME ZONE,

  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE platform_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type        TEXT NOT NULL CHECK (alert_type IN (
                      'endpoint_degraded', 'endpoint_down',
                      'facilitator_unreachable', 'fee_threshold_crossed',
                      'fee_overdue', 'dispute_flag_threshold',
                      'cert_expiring', 'cert_revoked',
                      'silver_threshold_reached', 'health_checker_down'
                    )),
  severity          TEXT NOT NULL CHECK (severity IN (
                      'critical', 'high', 'medium', 'low'
                    )),
  entity_type       TEXT CHECK (entity_type IN (
                      'endpoint', 'provider', 'certificate',
                      'invoice', 'platform'
                    )),
  entity_id         UUID,
  message           TEXT NOT NULL,
  resolved          BOOLEAN DEFAULT FALSE,
  resolved_at       TIMESTAMP WITH TIME ZONE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- providers
CREATE INDEX idx_providers_trust_tier ON providers(trust_tier);
CREATE INDEX idx_providers_is_active ON providers(is_active);
CREATE INDEX idx_providers_provider_track ON providers(provider_track);
CREATE INDEX idx_providers_country ON providers(country);

-- endpoints
CREATE INDEX idx_endpoints_provider_id ON endpoints(provider_id);
CREATE INDEX idx_endpoints_data_category ON endpoints(data_category);
CREATE INDEX idx_endpoints_is_active ON endpoints(is_active);
CREATE INDEX idx_endpoints_health_status ON endpoints(health_status);
CREATE INDEX idx_endpoints_trust_tier ON endpoints(id) WHERE is_active = TRUE;
CREATE INDEX idx_endpoints_competition_tag ON endpoints(competition_tag);

-- Full text search on directory (critical for $0.01 search queries)
CREATE INDEX idx_endpoints_fts ON endpoints USING GIN (
  to_tsvector('english',
    COALESCE(title, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE(data_category, '') || ' ' ||
    COALESCE(data_sub_category, '') || ' ' ||
    COALESCE(geography_region, '')
  )
);

-- transactions_log
CREATE INDEX idx_transactions_provider_id ON transactions_log(provider_id);
CREATE INDEX idx_transactions_endpoint_id ON transactions_log(endpoint_id);
CREATE INDEX idx_transactions_queried_at ON transactions_log(queried_at DESC);
CREATE INDEX idx_transactions_type ON transactions_log(transaction_type);

-- community_ratings
CREATE INDEX idx_ratings_endpoint_id ON community_ratings(endpoint_id);
CREATE INDEX idx_ratings_wallet ON community_ratings(rater_wallet_address);

-- dispute_flags
CREATE INDEX idx_disputes_endpoint_id ON dispute_flags(endpoint_id);
CREATE INDEX idx_disputes_status ON dispute_flags(status);

-- provenance_certificates
CREATE INDEX idx_certs_endpoint_id ON provenance_certificates(endpoint_id);
CREATE INDEX idx_certs_status ON provenance_certificates(status);
CREATE INDEX idx_certs_expires_at ON provenance_certificates(expires_at);
-- Used by renewal cron job

-- ogip_credit_ledger
CREATE INDEX idx_credits_providing ON ogip_credit_ledger(providing_ministry_id);
CREATE INDEX idx_credits_requesting ON ogip_credit_ledger(requesting_ministry_id);
CREATE INDEX idx_credits_period ON ogip_credit_ledger(settlement_period);

-- endpoint_health_checks
CREATE INDEX idx_health_endpoint_checked ON endpoint_health_checks(endpoint_id, checked_at DESC);

-- platform_alerts
CREATE INDEX idx_alerts_unresolved ON platform_alerts(resolved, severity) WHERE resolved = FALSE;

-- ============================================================================
-- ROW LEVEL SECURITY — every table (P4: RLS enabled on every table from day one)
-- ============================================================================

ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE provenance_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sbp_fee_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE formatting_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE endpoint_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE endpoint_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificate_revocation_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ogip_jurisdictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ogip_ministries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ogip_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE ogip_credit_ledger ENABLE ROW LEVEL SECURITY;

-- Service role (SBP admin, server-side API) bypasses RLS
-- This is Supabase default behaviour for the service role key

-- Public read policies (what unauthenticated users can see)
CREATE POLICY endpoints_public_read ON endpoints
  FOR SELECT TO anon
  USING (is_active = TRUE AND sensitivity_level = 'public');

CREATE POLICY certs_public_read ON provenance_certificates
  FOR SELECT TO anon
  USING (status = 'active');

CREATE POLICY jurisdictions_public_read ON ogip_jurisdictions
  FOR SELECT TO anon
  USING (TRUE);
-- Jurisdiction reference table is fully public

-- Provider self-access policies (authenticated providers)
CREATE POLICY providers_self_read ON providers
  FOR SELECT TO authenticated
  USING (contact_email = auth.email());

CREATE POLICY providers_self_update ON providers
  FOR UPDATE TO authenticated
  USING (contact_email = auth.email());

CREATE POLICY endpoints_provider_read ON endpoints
  FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE contact_email = auth.email()
    )
  );

CREATE POLICY endpoints_provider_write ON endpoints
  FOR ALL TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE contact_email = auth.email()
    )
  );

CREATE POLICY transactions_provider_read ON transactions_log
  FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE contact_email = auth.email()
    )
  );

CREATE POLICY invoices_provider_read ON sbp_fee_invoices
  FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE contact_email = auth.email()
    )
  );

CREATE POLICY uploads_provider_access ON uploaded_files
  FOR ALL TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE contact_email = auth.email()
    )
  );

CREATE POLICY formatting_provider_access ON formatting_runs
  FOR ALL TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE contact_email = auth.email()
    )
  );

CREATE POLICY certs_provider_read ON provenance_certificates
  FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE contact_email = auth.email()
    )
  );

-- Community ratings: providers can see ratings on their endpoints
CREATE POLICY ratings_provider_read ON community_ratings
  FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE contact_email = auth.email()
    )
  );

-- Dispute flags: providers can see flags on their endpoints
CREATE POLICY disputes_provider_read ON dispute_flags
  FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE contact_email = auth.email()
    )
  );

-- OGIP: ministry staff access their own ministry records
CREATE POLICY ministries_self_read ON ogip_ministries
  FOR SELECT TO authenticated
  USING (contact_email = auth.email() OR data_officer_email = auth.email());

CREATE POLICY credits_ministry_read ON ogip_credit_ledger
  FOR SELECT TO authenticated
  USING (
    providing_ministry_id IN (
      SELECT id FROM ogip_ministries
      WHERE contact_email = auth.email() OR data_officer_email = auth.email()
    )
    OR
    requesting_ministry_id IN (
      SELECT id FROM ogip_ministries
      WHERE contact_email = auth.email() OR data_officer_email = auth.email()
    )
  );

-- ============================================================================
-- DATABASE FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER providers_updated_at
  BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER endpoints_updated_at
  BEFORE UPDATE ON endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ministries_updated_at
  BEFORE UPDATE ON ogip_ministries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Increment provider tier12 earnings accrual
-- Called on every Tier 1-2 transaction
CREATE OR REPLACE FUNCTION increment_tier12_accrual(
  p_provider_id UUID,
  p_amount DECIMAL
)
RETURNS VOID AS $$
BEGIN
  UPDATE providers
  SET
    tier12_earnings_accrued = tier12_earnings_accrued + p_amount,
    total_revenue_usdc = total_revenue_usdc + p_amount
  WHERE id = p_provider_id;

  -- Check if threshold crossed — create invoice if so
  IF (
    SELECT tier12_earnings_accrued >= fee_threshold_usdc
    FROM providers WHERE id = p_provider_id
  ) THEN
    INSERT INTO sbp_fee_invoices (
      provider_id, period_start, period_end,
      tier12_revenue_total, sbp_fee_amount, status
    )
    SELECT
      p_provider_id,
      DATE_TRUNC('month', NOW())::DATE,
      (DATE_TRUNC('month', NOW()) + INTERVAL '1 month - 1 day')::DATE,
      tier12_earnings_accrued,
      tier12_earnings_accrued * sbp_fee_pct / 100,
      'due'
    FROM providers WHERE id = p_provider_id
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Check and update dispute flag count — auto-pause at threshold (Decision 30)
CREATE OR REPLACE FUNCTION check_dispute_threshold(
  p_endpoint_id UUID
)
RETURNS VOID AS $$
DECLARE
  flag_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO flag_count
  FROM dispute_flags
  WHERE endpoint_id = p_endpoint_id
    AND status = 'open';

  IF flag_count >= 3 THEN
    UPDATE endpoints
    SET
      is_active = FALSE,
      paused_reason = 'dispute_flags',
      paused_at = NOW()
    WHERE id = p_endpoint_id;

    INSERT INTO platform_alerts (
      alert_type, severity, entity_type, entity_id, message
    ) VALUES (
      'dispute_flag_threshold', 'high', 'endpoint', p_endpoint_id,
      'Endpoint auto-paused: 3 verified dispute flags reached'
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Check and update Silver tier status (Decision 28)
CREATE OR REPLACE FUNCTION check_silver_threshold(
  p_endpoint_id UUID
)
RETURNS VOID AS $$
DECLARE
  positive_count INTEGER;
  p_provider_id UUID;
BEGIN
  -- provider_id is read from endpoints, not aggregated from community_ratings:
  -- MIN()/MAX() have no built-in aggregate for the uuid type in Postgres
  SELECT provider_id INTO p_provider_id
  FROM endpoints WHERE id = p_endpoint_id;

  SELECT COUNT(*) INTO positive_count
  FROM community_ratings
  WHERE endpoint_id = p_endpoint_id
    AND rating = 'positive'
    AND query_verified = TRUE;

  -- POC threshold: 3 verified positive ratings
  -- Configurable — currently hardcoded at 3 per Decision 28
  IF positive_count >= 3 THEN
    -- Upgrade endpoint max tier
    UPDATE endpoints
    SET max_tier_at_bronze = 5
    WHERE id = p_endpoint_id;

    -- Check if all provider endpoints qualify for Silver
    -- Provider reaches Silver when at least one endpoint does
    UPDATE providers
    SET trust_tier = 'silver'
    WHERE id = p_provider_id
      AND trust_tier = 'bronze';

    INSERT INTO platform_alerts (
      alert_type, severity, entity_type, entity_id, message
    ) VALUES (
      'silver_threshold_reached', 'low', 'endpoint', p_endpoint_id,
      'Endpoint reached Silver tier: 3 verified purchaser upvotes'
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA
-- ============================================================================

INSERT INTO ogip_jurisdictions (code, name, jurisdiction_type, ogip_active) VALUES
  ('WS', 'Samoa', 'nation', TRUE),
  ('FJ', 'Fiji', 'nation', FALSE),
  ('TO', 'Tonga', 'nation', FALSE),
  ('VU', 'Vanuatu', 'nation', FALSE),
  ('PG', 'Papua New Guinea', 'nation', FALSE),
  ('SB', 'Solomon Islands', 'nation', FALSE),
  ('KI', 'Kiribati', 'nation', FALSE),
  ('TV', 'Tuvalu', 'nation', FALSE),
  ('NR', 'Nauru', 'nation', FALSE),
  ('PW', 'Palau', 'nation', FALSE),
  ('FM', 'Federated States of Micronesia', 'nation', FALSE),
  ('MH', 'Marshall Islands', 'nation', FALSE),
  ('CK', 'Cook Islands', 'nation', FALSE),
  ('NU', 'Niue', 'nation', FALSE),
  ('WF', 'Wallis and Futuna', 'nation', FALSE),
  ('REG-USP', 'University of the South Pacific', 'regional', FALSE),
  ('REG-SPC', 'Pacific Community (SPC)', 'intergovernmental', FALSE),
  ('REG-SPREP', 'SPREP', 'intergovernmental', FALSE),
  ('REG-PACIFIC', 'Pacific-wide', 'regional', FALSE);
