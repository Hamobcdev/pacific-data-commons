-- ============================================================================
-- Session 19 — External x402 sources for agent supplementary queries
-- (Decision 56, CLAUDE.md v2.2). Pacific PDC data is always primary; an
-- external source is always supplementary, clearly labelled, and only ever
-- queried if SBP has explicitly approved it here. Agents never query an
-- unapproved external source.
--
-- NOTE — no row is seeded by this migration. The session brief's draft
-- seed pointed at https://x402-demo.algorand.foundation/market as "the
-- WAD-26 demo endpoint" — checked against the actual WAD-26-x402-demo repo
-- (github.com/algorandfoundation/WAD-26-x402-demo) before writing this
-- migration, and that repo documents a *local-only* demo (client +
-- merchant + facilitator on localhost:5173), not a hosted public endpoint.
-- No real, currently-reachable external x402 endpoint exists to seed yet.
-- Seeding a fabricated URL here would silently break the first agent that
-- tried to query it and violates CLAUDE.md P5 (no placeholders). The first
-- real row belongs to whichever design-partner integration (Section 23)
-- or genuine external x402 endpoint SBP actually approves.
-- ============================================================================

CREATE TABLE IF NOT EXISTS approved_external_sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT NOT NULL,
  endpoint_url      TEXT NOT NULL UNIQUE,
  x402_compatible   BOOLEAN DEFAULT TRUE,
  data_category     TEXT NOT NULL,  -- matches PDC categories
  price_usdc        DECIMAL NOT NULL,
  provider_name     TEXT NOT NULL,  -- external organisation name
  provider_url      TEXT,           -- external organisation website
  geographic_scope  TEXT DEFAULT 'global',
  approved_by       TEXT DEFAULT 'sbp',
  approved_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active         BOOLEAN DEFAULT TRUE,
  notes             TEXT,           -- why this source is approved, what it adds
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Which agents are approved to query which external sources
CREATE TABLE IF NOT EXISTS agent_external_source_permissions (
  agent_id              UUID REFERENCES agents(id) ON DELETE CASCADE,
  external_source_id    UUID REFERENCES approved_external_sources(id) ON DELETE CASCADE,
  query_order           INTEGER DEFAULT 99,  -- lower = query first; PDC always 1
  is_supplementary      BOOLEAN DEFAULT TRUE, -- always true; PDC data is always primary
  PRIMARY KEY (agent_id, external_source_id)
);

-- RLS
ALTER TABLE approved_external_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_external_source_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_external_sources" ON approved_external_sources
  FOR SELECT TO anon, authenticated USING (is_active = TRUE);

CREATE POLICY "service_role_external_sources" ON approved_external_sources
  FOR ALL TO service_role USING (true);

CREATE POLICY "public_read_agent_permissions" ON agent_external_source_permissions
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "service_role_agent_permissions" ON agent_external_source_permissions
  FOR ALL TO service_role USING (true);
