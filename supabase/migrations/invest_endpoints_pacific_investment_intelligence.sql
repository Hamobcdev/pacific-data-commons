-- List 6 Pacific Investment Intelligence endpoints (Decision 59 — first-party
-- SBP synthesis publisher) on the public /data buyer-browse catalog.
--
-- Pricing rationale: Decision 60's $0.01 cap does NOT apply — that cap is
-- for single no-auth free-API wrappers. These endpoints are SBP synthesis
-- across 6 national government authority sources (MCIL/Samoa, Investment
-- Fiji, VFIPA/Vanuatu, IPA/PNG, MFEM/Tonga, MCITP/Solomon Islands).
-- Priced under Decision 23 Bronze ceiling ($0.50 max):
--   - pacific-setup-comparison: $0.50 (6-nation full matrix)
--   - pacific-tax-comparison:   $0.30 (tax rates, narrower scope)
--   - pacific-land-tenure:      $0.30 (tenure types, narrower scope)
--   - pacific-sector-restrictions: $0.40 (sector matrix)
--   - pacific-regulatory-scores: $0.50 (proprietary scoring model)
--   - pacific-setup-checklist:  $0.50 (per-nation sequential steps)
--
-- PERMANENT POLICY: customary land and traditional fishing rights are
-- information only. SBP does not facilitate, tokenise, or collateralise
-- customary land. This note appears in every /invest/pacific-land-tenure
-- response and is reflected in the endpoint description here.
--
-- data_category: 'trade' maps to the investment/commerce category under
-- DATA_CATEGORIES (apps/directory-api/src/lib/dataCategories.ts).
--
-- integrity_url: NULL — these are pre-structured in-memory datasets with
-- no versioned on-chain content hash at launch. The dataset_content_hash
-- field on any future certificate would cover the full service module
-- snapshot.
--
-- provider_id: '23688689-502a-437d-939b-3288d8292534' — SBP's own
-- "SBP pilot test account" provider row, consistent with all prior
-- first-party endpoint listing migrations.
--
-- NOT auto-applied — present as SUPABASE WRITE APPROVAL REQUEST and apply
-- manually via Supabase MCP after user confirms.

INSERT INTO endpoints (
  provider_id, data_category, data_sub_category, title, description,
  endpoint_url, health_check_url, integrity_url,
  geography_region, update_frequency,
  pricing_tiers, sensitivity_level, commercial_eligibility,
  competition_tag, is_active
) VALUES
(
  '23688689-502a-437d-939b-3288d8292534', 'trade', 'pacific_investment_setup',
  'Pacific Business Setup Comparison — 6 Nations',
  'Side-by-side comparison of business registration requirements across Samoa, Fiji, Vanuatu, Papua New Guinea, Tonga, and Solomon Islands — minimum capital, setup timeline, registration steps, foreign ownership rules, investment body contacts. SBP synthesis from 6 national investment authority sources (MCIL Samoa, Investment Fiji, VFIPA Vanuatu, IPA PNG, MFEM Tonga, MCITP Solomon Islands). October 2026. Optional ?nations= filter (ws,fj,vu,pg,to,sb).',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'annual',
  '[{"tier":1,"name":"summary","description":"6-nation investment setup comparison matrix — capital requirements, timelines, ownership rules, registration steps.","price_usdc":0.50,"path":"/invest/pacific-setup-comparison"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
),
(
  '23688689-502a-437d-939b-3288d8292534', 'trade', 'pacific_investment_tax',
  'Pacific Tax Comparison — 6 Nations',
  'Corporate income tax rates, withholding tax rates, VAT/GST rates, and key filing obligations across 6 Pacific nations. Vanuatu is a zero-income-tax jurisdiction — unique in the Pacific. SBP synthesis from national revenue authority sources. October 2026. Optional ?nations= filter.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'annual',
  '[{"tier":1,"name":"summary","description":"Corporate tax, withholding tax, and VAT/GST rates for 6 Pacific nations — including Vanuatu zero-tax status.","price_usdc":0.30,"path":"/invest/pacific-tax-comparison"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
),
(
  '23688689-502a-437d-939b-3288d8292534', 'trade', 'pacific_investment_land',
  'Pacific Land Tenure Comparison — 6 Nations',
  'Land tenure system comparison across 6 Pacific nations — customary vs freehold vs government land percentages, foreign ownership restrictions, lease terms, and land board requirements. Customary land and traditional fishing rights are information only — SBP does not facilitate, tokenise, or collateralise customary land. SBP synthesis from national land legislation. October 2026. Optional ?nations= filter.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'annual',
  '[{"tier":1,"name":"summary","description":"Land tenure types, customary percentages, foreign ownership rules, and lease terms for 6 Pacific nations. Information only — no collateralisation.","price_usdc":0.30,"path":"/invest/pacific-land-tenure"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
),
(
  '23688689-502a-437d-939b-3288d8292534', 'trade', 'pacific_investment_sectors',
  'Pacific Sector Restrictions Matrix — 6 Nations',
  'By-sector matrix of foreign investment restrictions across 6 Pacific nations — reserved (citizens only), restricted (equity cap or JV required), requires approval, or open. Covers fisheries, tourism, retail, media, utilities, agriculture, finance, and more. SBP synthesis from national investment authority reserved activities lists. October 2026. Optional ?sector= keyword filter and ?nations= filter.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'annual',
  '[{"tier":1,"name":"summary","description":"Sector-level foreign investment restriction status across 6 Pacific nations — essential pre-investment due diligence.","price_usdc":0.40,"path":"/invest/pacific-sector-restrictions"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
),
(
  '23688689-502a-437d-939b-3288d8292534', 'trade', 'pacific_investment_scores',
  'Pacific Regulatory Ease Scores — 6 Nations',
  'Proprietary SBP regulatory ease scores for 6 Pacific nations across 6 dimensions: setup cost, setup speed, foreign ownership openness, tax burden, land access, and regulatory complexity. Composite 1–10 score per nation, ranked highest-ease first. Not investment advice — independent legal and financial advice required before any investment decision. October 2026. Optional ?nations= filter.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'annual',
  '[{"tier":1,"name":"summary","description":"6-dimension regulatory ease scores and composite ranking for 6 Pacific nations — SBP proprietary model, not investment advice.","price_usdc":0.50,"path":"/invest/pacific-regulatory-scores"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
),
(
  '23688689-502a-437d-939b-3288d8292534', 'trade', 'pacific_investment_checklist',
  'Pacific Business Setup Checklist — Per Nation',
  'Sequential step-by-step checklist for registering a business in a specific Pacific nation — forms, fees, government agencies, expected timelines, and website links for each step. Covers company, sole trader, and partnership entity types across all 6 nations. Required ?nation=ws|fj|vu|pg|to|sb parameter. Optional ?entity_type=company|sole_trader|partnership (default: company). SBP synthesis from national registrar, tax authority, and investment authority sources.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'annual',
  '[{"tier":1,"name":"summary","description":"Full sequential business registration checklist with forms, fees, agencies, and timelines for one Pacific nation and entity type.","price_usdc":0.50,"path":"/invest/pacific-setup-checklist"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
