-- ============================================================================
-- PDQE Stage 08 — Migration 1 of 1
-- pdqe.endpoints, pdqe.endpoint_status, pdqe.pricing_tier
--
-- An ENDPOINT is a deterministic, machine-queryable specification generated
-- from a collection-linked dataset. It is DATA, never code: path, routing,
-- parameter types, pricing tier and provenance are all assigned by
-- deterministic code (app/endpoint/), and nothing model-generated is ever
-- executed.
--
--   COLLECTION_LINKED → (Stage 08) → ENDPOINT_GENERATED
--                                    (pdqe.transition_to_endpoint_generated)
--
-- Generation is NOT publication. Every endpoint is inserted as DRAFT (forced
-- by trg_pdqe_endpoints_check_insert regardless of what the caller sends) and
-- must pass Stage 09 (endpoint validation + provider/SBP approval) before it
-- can be PUBLISHED or x402-queryable.
--
-- Reference: PDQE_MASTER_BUILD.md, Stage 08, P7, P9
-- Depends on: 20261008000002_pdqe_sources.sql (pdqe.set_updated_at)
--             20261008000003_pdqe_pipeline_state.sql
--             20261008000004_pdqe_audit_log.sql (pdqe.log_event)
--             20261011000001_pdqe_jev_assessments.sql (pdqe.domain_classification)
--             20261012000003_pdqe_datasets_collections.sql
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-12
--
-- ADDITIVE ONLY. No existing table, function, type or row is modified.
-- The COLLECTION_LINKED → ENDPOINT_GENERATED transition and the
-- ENDPOINT_GENERATED audit event type are already seeded (confirmed against
-- the live DB before writing this migration); both are idempotent no-ops here.
--
-- pdqe.datasets.lifecycle_state is deliberately NOT advanced past
-- COLLECTION_LINKED (its CHECK allows only DATASET_CREATED/COLLECTION_LINKED,
-- and widening it would modify a Stage 07 object). The source row carries
-- the pipeline lifecycle; UNIQUE (dataset_id) below stops a second endpoint.
-- ============================================================================

BEGIN;

-- ── 1. Permitted transition and audit event type ─────────────────────────────

INSERT INTO pdqe.permitted_transitions (state_from, state_to)
VALUES ('COLLECTION_LINKED', 'ENDPOINT_GENERATED')
ON CONFLICT (state_from, state_to) DO NOTHING;

ALTER TYPE pdqe.audit_event_type ADD VALUE IF NOT EXISTS 'ENDPOINT_GENERATED';

-- ── 2. Enums ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE n.nspname = 'pdqe' AND t.typname = 'endpoint_status') THEN
    CREATE TYPE pdqe.endpoint_status AS ENUM ('DRAFT', 'VALIDATED', 'PUBLISHED', 'DEPRECATED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE n.nspname = 'pdqe' AND t.typname = 'pricing_tier') THEN
    CREATE TYPE pdqe.pricing_tier AS ENUM ('T0', 'T1', 'T2', 'T3', 'T4', 'T5');
  END IF;
END;
$$;

COMMENT ON TYPE pdqe.endpoint_status IS
  'DRAFT (generated, Stage 08) -> VALIDATED (Stage 09) -> PUBLISHED (live,
   x402-queryable) -> DEPRECATED. Forward-only; enforced by
   trg_pdqe_endpoints_guard_mutation.';

COMMENT ON TYPE pdqe.pricing_tier IS
  'Default USDC price per query: T0 0.001 raw proxy (unvalidated), T1 0.01
   validated single indicator, T2 0.10 multi-source validated, T3 0.50
   PDF-extracted Jev-validated, T4 2.00 composite multi-nation index, T5 5.00
   sovereign/community data (requires cultural_sovereignty = TRUE).';

-- Tier → default price. IMMUTABLE so it can be used anywhere; single source
-- of truth on the DB side (mirrors TIER_PRICES in app/endpoint/schemas.py).
CREATE OR REPLACE FUNCTION pdqe.pricing_tier_default_price(p_tier pdqe.pricing_tier)
RETURNS NUMERIC(10,4)
LANGUAGE sql
IMMUTABLE
SET search_path = pdqe, pg_temp
AS $$
  SELECT CASE p_tier
           WHEN 'T0' THEN 0.001
           WHEN 'T1' THEN 0.01
           WHEN 'T2' THEN 0.10
           WHEN 'T3' THEN 0.50
           WHEN 'T4' THEN 2.00
           WHEN 'T5' THEN 5.00
         END::NUMERIC(10,4);
$$;

-- ── 3. pdqe.endpoints ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pdqe.endpoints (
  endpoint_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  dataset_id             UUID NOT NULL REFERENCES pdqe.datasets(dataset_id) ON DELETE RESTRICT,
  -- Primary collection. Must be one the dataset is linked to (insert trigger).
  collection_id          UUID REFERENCES pdqe.collections(collection_id) ON DELETE RESTRICT,

  path                   TEXT NOT NULL UNIQUE,
  slug                   TEXT NOT NULL,
  title                  TEXT NOT NULL,
  description            TEXT,
  domain                 pdqe.domain_classification NOT NULL,

  pricing_tier           pdqe.pricing_tier NOT NULL DEFAULT 'T1',
  -- Actual price. Defaulted from pricing_tier by the insert trigger when
  -- NULL; providers may set it higher at Stage 09 approval.
  price_usdc             NUMERIC(10,4) NOT NULL,
  cultural_sovereignty   BOOLEAN NOT NULL DEFAULT FALSE,
  -- Algorand address for payment routing. NULL until the provider sets it;
  -- required before PUBLISHED.
  provider_wallet        TEXT,

  response_schema        JSONB NOT NULL DEFAULT '{}'::jsonb,
  parameters             JSONB NOT NULL DEFAULT '[]'::jsonb,
  query_examples         JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- SHA-256 (lowercase hex) of the canonical endpoint spec computed by
  -- app/endpoint/generator.py.
  endpoint_hash          TEXT NOT NULL,

  -- Redundant provenance — never lose the trail back to dataset and sources.
  provenance_dataset_id  UUID NOT NULL,
  provenance_source_ids  UUID[] NOT NULL,

  status                 pdqe.endpoint_status NOT NULL DEFAULT 'DRAFT',
  generated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT endpoints_path_pacific          CHECK (path LIKE '/pacific/%'),
  CONSTRAINT endpoints_slug_format           CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  -- Path is fully determined by domain + slug: /pacific/{domain}/{slug}.
  CONSTRAINT endpoints_path_matches_parts    CHECK (
    path = '/pacific/' || lower(replace(domain::text, '_', '-')) || '/' || slug
  ),
  CONSTRAINT endpoints_title_not_blank       CHECK (char_length(trim(title)) > 0),
  CONSTRAINT endpoints_price_positive        CHECK (price_usdc > 0),
  CONSTRAINT endpoints_response_schema_object CHECK (jsonb_typeof(response_schema) = 'object'),
  CONSTRAINT endpoints_parameters_array      CHECK (jsonb_typeof(parameters) = 'array'),
  CONSTRAINT endpoints_query_examples_array  CHECK (jsonb_typeof(query_examples) = 'array'),
  CONSTRAINT endpoints_t5_requires_sovereignty CHECK (pricing_tier != 'T5' OR cultural_sovereignty = TRUE),
  CONSTRAINT endpoints_hash_sha256           CHECK (endpoint_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT endpoints_provenance_dataset    CHECK (provenance_dataset_id = dataset_id),
  CONSTRAINT endpoints_provenance_sources_nonempty CHECK (cardinality(provenance_source_ids) >= 1),
  -- Algorand addresses: 58 chars, RFC 4648 base32 alphabet.
  CONSTRAINT endpoints_provider_wallet_format CHECK (
    provider_wallet IS NULL OR provider_wallet ~ '^[A-Z2-7]{58}$'
  ),
  CONSTRAINT endpoints_published_needs_wallet CHECK (
    status != 'PUBLISHED' OR provider_wallet IS NOT NULL
  ),
  -- One endpoint per dataset for now; multi-endpoint per dataset is Stage 11+.
  CONSTRAINT endpoints_one_per_dataset       UNIQUE (dataset_id)
);

COMMENT ON TABLE pdqe.endpoints IS
  'Stage 08 endpoint specification generated deterministically from a
   collection-linked dataset. Data, never code. Inserted as DRAFT only —
   generation is not publication; Stage 09 validation and provider/SBP
   approval are required before PUBLISHED. Provenance columns are immutable.
   No DELETE for any role.';

COMMENT ON COLUMN pdqe.endpoints.endpoint_hash IS
  'SHA-256 of the canonical JSON (sorted keys, no whitespace, UTF-8) of the
   endpoint spec, excluding the hash itself, including hash_version.';

COMMENT ON COLUMN pdqe.endpoints.cultural_sovereignty IS
  'TRUE for sovereign/community-owned data. Must match the dataset''s
   metadata.cultural_sovereignty flag (insert trigger). Required for T5.';

CREATE INDEX IF NOT EXISTS idx_endpoints_status ON pdqe.endpoints (status);
CREATE INDEX IF NOT EXISTS idx_endpoints_domain ON pdqe.endpoints (domain);
CREATE INDEX IF NOT EXISTS idx_endpoints_collection_id ON pdqe.endpoints (collection_id);
CREATE INDEX IF NOT EXISTS idx_endpoints_provenance_source_ids
  ON pdqe.endpoints USING GIN (provenance_source_ids);

CREATE TRIGGER trg_pdqe_endpoints_updated_at
  BEFORE UPDATE ON pdqe.endpoints
  FOR EACH ROW EXECUTE FUNCTION pdqe.set_updated_at();

-- ── 4. Integrity triggers ─────────────────────────────────────────────────────

-- 4a. INSERT: dataset and its primary source must be COLLECTION_LINKED;
-- provenance, domain, collection and sovereignty flag must agree with the
-- dataset; price defaults from tier; status is always DRAFT.
CREATE OR REPLACE FUNCTION pdqe.check_endpoint_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pdqe, pg_temp
AS $$
DECLARE
  v_ds          pdqe.datasets;
  v_src_state   TEXT;
  v_ds_cultural BOOLEAN;
BEGIN
  SELECT * INTO v_ds FROM pdqe.datasets WHERE dataset_id = NEW.dataset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pdqe.endpoints: dataset % not found', NEW.dataset_id;
  END IF;
  IF v_ds.lifecycle_state != 'COLLECTION_LINKED' THEN
    RAISE EXCEPTION 'pdqe.endpoints: dataset % is in state % (expected COLLECTION_LINKED)',
      NEW.dataset_id, v_ds.lifecycle_state;
  END IF;

  SELECT lifecycle_state INTO v_src_state FROM pdqe.sources WHERE source_id = v_ds.primary_source_id;
  IF v_src_state IS DISTINCT FROM 'COLLECTION_LINKED' THEN
    RAISE EXCEPTION 'pdqe.endpoints: primary source % is in state % (expected COLLECTION_LINKED)',
      v_ds.primary_source_id, v_src_state;
  END IF;

  IF NEW.domain IS DISTINCT FROM v_ds.domain THEN
    RAISE EXCEPTION 'pdqe.endpoints: domain % does not match dataset domain %', NEW.domain, v_ds.domain;
  END IF;

  -- Same set of sources as the dataset (order-insensitive, no extras, none lost).
  IF NOT (NEW.provenance_source_ids @> v_ds.source_ids AND NEW.provenance_source_ids <@ v_ds.source_ids) THEN
    RAISE EXCEPTION 'pdqe.endpoints: provenance_source_ids do not match dataset % source_ids', NEW.dataset_id;
  END IF;

  IF NEW.collection_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM pdqe.dataset_collections
        WHERE dataset_id = NEW.dataset_id AND collection_id = NEW.collection_id) THEN
    RAISE EXCEPTION 'pdqe.endpoints: dataset % is not linked to collection %',
      NEW.dataset_id, NEW.collection_id;
  END IF;

  v_ds_cultural := coalesce(v_ds.metadata -> 'cultural_sovereignty' = 'true'::jsonb, false);
  IF NEW.cultural_sovereignty IS DISTINCT FROM v_ds_cultural THEN
    RAISE EXCEPTION 'pdqe.endpoints: cultural_sovereignty % does not match dataset % flag %',
      NEW.cultural_sovereignty, NEW.dataset_id, v_ds_cultural;
  END IF;

  IF NEW.price_usdc IS NULL THEN
    NEW.price_usdc := pdqe.pricing_tier_default_price(NEW.pricing_tier);
  END IF;

  -- Generation is not publication.
  NEW.status := 'DRAFT';
  NEW.provenance_dataset_id := NEW.dataset_id;
  NEW.generated_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdqe_endpoints_check_insert
  BEFORE INSERT ON pdqe.endpoints
  FOR EACH ROW EXECUTE FUNCTION pdqe.check_endpoint_insert();

-- 4b. UPDATE/DELETE: provenance and routing identity are immutable; status
-- moves forward only. Covers service_role too, which bypasses RLS.
CREATE OR REPLACE FUNCTION pdqe.guard_endpoint_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pdqe, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pdqe.endpoints: DELETE is not permitted (endpoint %)', OLD.endpoint_id;
  END IF;

  IF NEW.endpoint_id IS DISTINCT FROM OLD.endpoint_id
     OR NEW.dataset_id IS DISTINCT FROM OLD.dataset_id
     OR NEW.path IS DISTINCT FROM OLD.path
     OR NEW.slug IS DISTINCT FROM OLD.slug
     OR NEW.domain IS DISTINCT FROM OLD.domain
     OR NEW.cultural_sovereignty IS DISTINCT FROM OLD.cultural_sovereignty
     OR NEW.provenance_dataset_id IS DISTINCT FROM OLD.provenance_dataset_id
     OR NEW.provenance_source_ids IS DISTINCT FROM OLD.provenance_source_ids
     OR NEW.generated_at IS DISTINCT FROM OLD.generated_at THEN
    RAISE EXCEPTION 'pdqe.endpoints: provenance and routing fields are immutable (endpoint %)',
      OLD.endpoint_id;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'DRAFT'     AND NEW.status IN ('VALIDATED', 'DEPRECATED'))
    OR (OLD.status = 'VALIDATED' AND NEW.status IN ('PUBLISHED', 'DEPRECATED'))
    OR (OLD.status = 'PUBLISHED' AND NEW.status = 'DEPRECATED')
  ) THEN
    RAISE EXCEPTION 'pdqe.endpoints: status transition % -> % is not permitted (endpoint %)',
      OLD.status, NEW.status, OLD.endpoint_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdqe_endpoints_guard_mutation
  BEFORE UPDATE OR DELETE ON pdqe.endpoints
  FOR EACH ROW EXECUTE FUNCTION pdqe.guard_endpoint_mutation();

-- ── 5. Transition function ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pdqe.transition_to_endpoint_generated(
  p_source_id    UUID,
  p_endpoint_id  UUID
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
DECLARE
  v_current_state TEXT;
  v_ep_dataset    UUID;
  v_ep_hash       TEXT;
  v_ep_path       TEXT;
  v_ep_tier       pdqe.pricing_tier;
  v_ds_source     UUID;
  v_row           pdqe.pipeline_state;
BEGIN
  SELECT lifecycle_state INTO v_current_state
    FROM pdqe.sources
   WHERE source_id = p_source_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;
  IF v_current_state != 'COLLECTION_LINKED' THEN
    RAISE EXCEPTION
      'Cannot transition source % to ENDPOINT_GENERATED: current state is % (expected COLLECTION_LINKED)',
      p_source_id, v_current_state;
  END IF;

  SELECT dataset_id, endpoint_hash, path, pricing_tier
    INTO v_ep_dataset, v_ep_hash, v_ep_path, v_ep_tier
    FROM pdqe.endpoints
   WHERE endpoint_id = p_endpoint_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE endpoint not found: %', p_endpoint_id;
  END IF;

  SELECT primary_source_id INTO v_ds_source FROM pdqe.datasets WHERE dataset_id = v_ep_dataset;
  IF v_ds_source IS DISTINCT FROM p_source_id THEN
    RAISE EXCEPTION 'Endpoint % dataset does not have source % as its primary source',
      p_endpoint_id, p_source_id;
  END IF;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, rationale, output_hash
  ) VALUES (
    p_source_id, 'COLLECTION_LINKED', 'ENDPOINT_GENERATED',
    'DETERMINISTIC', 'pdqe-stage08-v0.8.0',
    'Endpoint ' || p_endpoint_id || ' generated at ' || v_ep_path || ' (' || v_ep_tier || ', DRAFT)',
    v_ep_hash
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = 'ENDPOINT_GENERATED',
         updated_at      = now()
   WHERE source_id = p_source_id;

  PERFORM pdqe.log_event(
    p_event_type        => 'ENDPOINT_GENERATED',
    p_source_id         => p_source_id,
    p_pipeline_state_id => v_row.state_id,
    p_actor_type        => 'DETERMINISTIC',
    p_actor_version     => 'pdqe-stage08-v0.8.0',
    p_details           => jsonb_build_object('endpoint_id', p_endpoint_id,
                                              'dataset_id', v_ep_dataset,
                                              'path', v_ep_path,
                                              'pricing_tier', v_ep_tier),
    p_output_hash       => v_ep_hash
  );

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.transition_to_endpoint_generated IS
  'Advance a source COLLECTION_LINKED -> ENDPOINT_GENERATED once its endpoint
   spec row exists (Stage 08). Appends pipeline_state (actor_type =
   DETERMINISTIC, output_hash = endpoint_hash) and audits it. Does not
   publish anything. SECURITY DEFINER; EXECUTE granted to service_role and
   pdqe_admin only.';

-- ── 6. Row Level Security ──────────────────────────────────────────────────────
-- No DELETE policy for anyone; the guard trigger also covers service_role.

ALTER TABLE pdqe.endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdqe_admin_read_endpoints"    ON pdqe.endpoints FOR SELECT TO pdqe_admin USING (true);
CREATE POLICY "pdqe_admin_insert_endpoints"  ON pdqe.endpoints FOR INSERT TO pdqe_admin WITH CHECK (true);
CREATE POLICY "pdqe_admin_update_endpoints"  ON pdqe.endpoints FOR UPDATE TO pdqe_admin USING (true) WITH CHECK (true);
CREATE POLICY "pdqe_reviewer_read_endpoints" ON pdqe.endpoints FOR SELECT TO pdqe_reviewer USING (true);
CREATE POLICY "service_role_all_endpoints"   ON pdqe.endpoints FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 7. Grants ─────────────────────────────────────────────────────────────────

GRANT USAGE ON TYPE pdqe.endpoint_status, pdqe.pricing_tier TO pdqe_admin, pdqe_reviewer, service_role;

GRANT SELECT, INSERT, UPDATE ON pdqe.endpoints TO pdqe_admin;
GRANT SELECT ON pdqe.endpoints TO pdqe_reviewer;
GRANT ALL ON pdqe.endpoints TO service_role;

REVOKE DELETE ON pdqe.endpoints FROM pdqe_admin, pdqe_reviewer;
REVOKE ALL ON pdqe.endpoints FROM pdqe_provider, pdqe_reader, anon, authenticated;

-- Postgres grants EXECUTE on new functions to PUBLIC by default — strip it.
REVOKE ALL ON FUNCTION pdqe.pricing_tier_default_price(pdqe.pricing_tier) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.check_endpoint_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.guard_endpoint_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_endpoint_generated(UUID, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION pdqe.pricing_tier_default_price(pdqe.pricing_tier) TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.transition_to_endpoint_generated(UUID, UUID) TO service_role, pdqe_admin;

COMMIT;
