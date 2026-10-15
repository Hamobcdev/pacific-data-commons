-- Capture the 4 Samoa SIFA/jurisdiction intelligence endpoints as a
-- committed migration, for environment reproducibility.
--
-- These 4 rows were inserted directly against the live project on
-- 2026-10-15 (same day as PR #155, "SIFA regulatory intelligence
-- endpoints (Phase 1)") but PR #155 itself touched only
-- apps/directory-api route/service/catalog code — no SQL migration was
-- ever committed for the corresponding `endpoints` table rows. Rebuilding
-- this environment from the committed migrations alone would therefore
-- not reproduce these 4 rows. This migration closes that gap.
--
-- Column values below are the exact live values (including `id`,
-- `created_at`, and `goplausible_registered` — the latter true here,
-- diverging from the column's own `false` default) as queried directly
-- from the live `endpoints` table on 2026-10-16. All other columns not
-- listed here (geography_*, sensitivity_level, sample_response,
-- query_parameters, sovereignty_framework, attribution_format,
-- donor_conditions, community_consent_doc, skills_file_*, paused_*,
-- bazaar_registered_at, last_health_check_at, etc.) are NULL on all 4
-- live rows, matching this table's own column defaults, so they are left
-- to default rather than restated here.
--
-- id is included explicitly, and ON CONFLICT targets it, because
-- `endpoints` has no unique constraint on data_sub_category (or any
-- other natural key) — only PRIMARY KEY (id). Reusing the live rows'
-- own ids is what makes "ON CONFLICT DO NOTHING" actually safe to apply
-- against the live project: the conflict target matches the already-
-- existing rows, so this becomes a true no-op there. Letting `id`
-- default to gen_random_uuid() instead would insert 4 duplicate rows
-- with new ids the moment this migration ran against the live DB.
--
-- provider_id '23688689-502a-437d-939b-3288d8292534' is SBP's own "SBP
-- pilot test account" provider row — same first-party provider used by
-- every prior first-party endpoint listing migration (see
-- invest_endpoints_pacific_investment_intelligence.sql).
--
-- NOT auto-applied — SUPABASE WRITE APPROVAL REQUEST. Apply manually via
-- Supabase MCP after user confirms. Safe to apply against the live
-- project: all 4 rows already exist there with these exact ids, so
-- ON CONFLICT (id) DO NOTHING will no-op on every row.

INSERT INTO endpoints (
  id, provider_id, data_category, data_sub_category, title, description,
  endpoint_url, health_check_url, integrity_url,
  update_frequency, pricing_tiers, commercial_eligibility,
  competition_tag, is_active, goplausible_registered, created_at
) VALUES
(
  '633b5ee1-4a65-4b2e-8f88-71874b2f32a5',
  '23688689-502a-437d-939b-3288d8292534', 'governance', 'samoa_jurisdiction_intelligence_banking_setup',
  'Samoa International Banking Licence Requirements',
  'Samoa International Banking Licence requirements under the International Banking Act 2005 — USD 1M minimum capital, director qualifications, MLPA 2007-compliant AML/CFT programme, SIFA fit-and-proper assessment, 8-step application timeline (3-6 months), annual obligations, and a CBS consultation note for USDC/digital asset banking activities.',
  'https://api.synergybcpacific.com', NULL, NULL,
  'static',
  '[{"name":"summary","path":"/pacific/samoa-banking-setup","tier":1,"price_usdc":5,"description":"Full banking licence requirements, application steps, and CBS/CBDC consultation note."}]'::jsonb,
  'fully_commercial', 'x402-global-challenge', true, true,
  '2026-10-15 00:27:07.347402+00'
),
(
  'df1e57c4-1653-40bc-a873-edc207d1b05b',
  '23688689-502a-437d-939b-3288d8292534', 'governance', 'samoa_jurisdiction_intelligence_compliance_status',
  'Samoa Regulatory Compliance Status (EU / FATF / OECD / TIEA)',
  'Samoa''s current regulatory compliance status across EU, FATF, OECD, and TIEA networks, structured for AI due diligence agents. EU blacklist removal (2026-02-17), FATF APG status (2023 Follow-Up Report), OECD Global Forum peer review rating marked pending_verification pending independent confirmation against the official OECD source.',
  'https://api.synergybcpacific.com', NULL, NULL,
  'static',
  '[{"name":"summary","path":"/pacific/samoa-compliance-status","tier":1,"price_usdc":1,"description":"Structured due_diligence_signal (low_risk/medium_risk/high_risk) plus EU/FATF/OECD/TIEA detail."}]'::jsonb,
  'fully_commercial', 'x402-global-challenge', true, true,
  '2026-10-15 00:27:07.347402+00'
),
(
  '02c8f7e5-5ee1-440c-a50f-4c57f293a02c',
  '23688689-502a-437d-939b-3288d8292534', 'governance', 'samoa_jurisdiction_intelligence_entity_setup',
  'Samoa International Entity Formation Requirements',
  'Structured regulatory intelligence for IBC, international trust, foundation, international banking licence, insurance, partnership, and mutual fund formation in Samoa — director/shareholder requirements, minimum capital, tax treatment, UBO disclosure obligations, formation timeline, typical fees. Source: SIFA Act 2005, International Companies Act 1987.',
  'https://api.synergybcpacific.com', NULL, NULL,
  'static',
  '[{"name":"summary","path":"/pacific/samoa-entity-setup","tier":1,"price_usdc":3,"description":"Entity formation requirements by entity_type (ibc|trust|foundation|international_bank|insurance|partnership|mutual_fund|all)."}]'::jsonb,
  'fully_commercial', 'x402-global-challenge', true, true,
  '2026-10-15 00:27:07.347402+00'
),
(
  'fcc671f5-c298-4830-9a03-e27bed61f064',
  '23688689-502a-437d-939b-3288d8292534', 'governance', 'samoa_jurisdiction_intelligence_service_providers',
  'Samoa SIFA-Licensed Trustee Company Directory',
  'Directory of SIFA-licensed trustee companies in Samoa — the registered agents required by law for Samoa international entity formation. Register verified 2026-10-15 via samoaibfc.ws (sifa.ws itself blocks automated access — see register_source in response).',
  'https://api.synergybcpacific.com', NULL, NULL,
  'static',
  '[{"name":"summary","path":"/pacific/samoa-service-providers","tier":1,"price_usdc":1.5,"description":"Full trustee company directory with register provenance."}]'::jsonb,
  'fully_commercial', 'x402-global-challenge', true, true,
  '2026-10-15 00:27:07.347402+00'
)
ON CONFLICT (id) DO NOTHING;
