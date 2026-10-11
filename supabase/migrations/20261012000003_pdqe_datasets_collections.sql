-- ============================================================================
-- PDQE Stage 07 — Migration 1 of 1
-- pdqe.datasets, pdqe.collections, pdqe.dataset_collections
--
-- SOURCE, DATASET and COLLECTION are distinct objects:
--
--   SOURCE      origin of information (pdqe.sources, Stage 01)
--   DATASET     structured, versioned representation of data derived from
--               one or more source extractions. Every contributing source
--               and extraction stays traceable — dataset metadata never
--               erases source provenance.
--   COLLECTION  thematic / domain grouping of datasets (M:M).
--
--   APPROVED        → (Stage 07) → DATASET_CREATED    (pdqe.transition_to_dataset_created)
--   DATASET_CREATED → (Stage 07) → COLLECTION_LINKED  (pdqe.transition_to_collection_linked)
--
-- Reference: PDQE_MASTER_BUILD.md, Stage 07, P7, P9
-- Depends on: 20261008000002_pdqe_sources.sql
--             20261008000003_pdqe_pipeline_state.sql
--             20261008000004_pdqe_audit_log.sql
--             20261008000005_pdqe_ingestion_events.sql
--             20261008000006_pdqe_extractions.sql
--             20261011000001_pdqe_jev_assessments.sql (pdqe.domain_classification)
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-12
--
-- ADDITIVE ONLY. No existing table, function or row is modified. Three
-- values are appended to pdqe.audit_event_type (ADD VALUE IF NOT EXISTS);
-- they are referenced only inside plpgsql bodies, which run after commit.
-- ============================================================================

BEGIN;

-- ── 1. Permitted transitions ──────────────────────────────────────────────────
-- Both are already seeded by 20261008000003 (confirmed against the live DB
-- before writing this migration). Kept as idempotent no-ops so the Stage 07
-- allowlist requirement is explicit in this file.

INSERT INTO pdqe.permitted_transitions (state_from, state_to)
VALUES ('APPROVED', 'DATASET_CREATED'), ('DATASET_CREATED', 'COLLECTION_LINKED')
ON CONFLICT (state_from, state_to) DO NOTHING;

-- ── 2. Audit event types (P7) ─────────────────────────────────────────────────

ALTER TYPE pdqe.audit_event_type ADD VALUE IF NOT EXISTS 'DATASET_CREATED';
ALTER TYPE pdqe.audit_event_type ADD VALUE IF NOT EXISTS 'COLLECTION_CREATED';
ALTER TYPE pdqe.audit_event_type ADD VALUE IF NOT EXISTS 'DATASET_COLLECTION_LINKED';

-- ── 3. pdqe.datasets ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pdqe.datasets (
  dataset_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provenance. Arrays cannot carry element FKs, so membership is enforced by
  -- trg_pdqe_datasets_check_insert (§5a). All provenance columns are
  -- immutable after insert (§5b).
  source_ids          UUID[] NOT NULL,
  primary_source_id   UUID NOT NULL REFERENCES pdqe.sources(source_id) ON DELETE RESTRICT,
  extraction_ids      UUID[] NOT NULL,

  domain              pdqe.domain_classification NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  geography_scope     TEXT[] NOT NULL DEFAULT '{}',
  -- Human-readable, not DATE: sources often state only a year or quarter.
  time_period_start   TEXT,
  time_period_end     TEXT,
  licence_status      pdqe.licence_status NOT NULL,
  licence_url         TEXT,

  -- Increments on re-extraction; one dataset version per primary source.
  version             INTEGER NOT NULL DEFAULT 1,
  -- SHA-256 (lowercase hex) of the canonical JSON representation computed by
  -- app/dataset/builder.py — the dataset's provenance anchor.
  dataset_hash        TEXT NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,

  lifecycle_state     TEXT NOT NULL DEFAULT 'DATASET_CREATED',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT datasets_licence_not_excluded CHECK (licence_status != 'EXCLUDED'),
  -- "Unknown is not approval" — a dataset never carries an unconfirmed licence.
  CONSTRAINT datasets_licence_not_unknown  CHECK (licence_status != 'UNKNOWN'),
  CONSTRAINT datasets_source_ids_nonempty  CHECK (cardinality(source_ids) >= 1),
  CONSTRAINT datasets_extraction_ids_nonempty CHECK (cardinality(extraction_ids) >= 1),
  CONSTRAINT datasets_primary_in_sources   CHECK (primary_source_id = ANY (source_ids)),
  CONSTRAINT datasets_title_not_blank      CHECK (char_length(trim(title)) > 0),
  CONSTRAINT datasets_version_positive     CHECK (version >= 1),
  CONSTRAINT datasets_hash_sha256          CHECK (dataset_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT datasets_metadata_object      CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT datasets_lifecycle_state_valid
    CHECK (lifecycle_state IN ('DATASET_CREATED', 'COLLECTION_LINKED')),
  CONSTRAINT datasets_one_version_per_source UNIQUE (primary_source_id, version)
);

COMMENT ON TABLE pdqe.datasets IS
  'Stage 07 dataset: a versioned representation of data derived from one or
   more approved source extractions. Provenance columns (source_ids,
   primary_source_id, extraction_ids) and every hashed field are immutable;
   lifecycle_state changes only via the Stage 07 transition functions. No
   DELETE for any role.';

COMMENT ON COLUMN pdqe.datasets.dataset_hash IS
  'SHA-256 of the canonical JSON (sorted keys, no whitespace, UTF-8) of
   {hash_version, source_ids, extraction_ids, domain, title, licence_status,
   geography_scope}. Provenance anchor — immutable.';

CREATE INDEX IF NOT EXISTS idx_datasets_primary_source_id ON pdqe.datasets (primary_source_id);
CREATE INDEX IF NOT EXISTS idx_datasets_domain ON pdqe.datasets (domain);
CREATE INDEX IF NOT EXISTS idx_datasets_source_ids ON pdqe.datasets USING GIN (source_ids);

CREATE TRIGGER trg_pdqe_datasets_updated_at
  BEFORE UPDATE ON pdqe.datasets
  FOR EACH ROW EXECUTE FUNCTION pdqe.set_updated_at();

-- ── 4. pdqe.collections and pdqe.dataset_collections ──────────────────────────

CREATE TABLE IF NOT EXISTS pdqe.collections (
  collection_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,
  description       TEXT,
  domain            pdqe.domain_classification NOT NULL,
  geography_scope   TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT collections_name_not_blank CHECK (char_length(trim(name)) > 0)
);

COMMENT ON TABLE pdqe.collections IS
  'Stage 07 thematic / domain grouping of datasets (e.g. "Pacific Fisheries
   Collection"). Grouping only — a collection never alters dataset provenance.
   No DELETE for any role.';

CREATE TRIGGER trg_pdqe_collections_updated_at
  BEFORE UPDATE ON pdqe.collections
  FOR EACH ROW EXECUTE FUNCTION pdqe.set_updated_at();

CREATE TABLE IF NOT EXISTS pdqe.dataset_collections (
  dataset_id      UUID NOT NULL REFERENCES pdqe.datasets(dataset_id) ON DELETE RESTRICT,
  collection_id   UUID NOT NULL REFERENCES pdqe.collections(collection_id) ON DELETE RESTRICT,
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset_id, collection_id)
);

COMMENT ON TABLE pdqe.dataset_collections IS
  'Stage 07 M:M link between datasets and collections. Append-only: no UPDATE
   or DELETE for any role.';

CREATE INDEX IF NOT EXISTS idx_dataset_collections_collection_id
  ON pdqe.dataset_collections (collection_id);

-- ── 5. Integrity triggers ─────────────────────────────────────────────────────

-- 5a. INSERT on datasets: the primary source must be APPROVED and every
-- array element must reference a real row — the element-level FK check
-- Postgres cannot express declaratively.
CREATE OR REPLACE FUNCTION pdqe.check_dataset_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pdqe, pg_temp
AS $$
DECLARE
  v_state     TEXT;
  v_licence   pdqe.licence_status;
  v_missing   UUID;
BEGIN
  SELECT lifecycle_state, licence_status INTO v_state, v_licence
    FROM pdqe.sources WHERE source_id = NEW.primary_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pdqe.datasets: primary source % not found', NEW.primary_source_id;
  END IF;
  IF v_state != 'APPROVED' THEN
    RAISE EXCEPTION 'pdqe.datasets: primary source % is in state % (expected APPROVED)',
      NEW.primary_source_id, v_state;
  END IF;
  IF NEW.licence_status IS DISTINCT FROM v_licence THEN
    RAISE EXCEPTION 'pdqe.datasets: licence_status % does not match primary source licence %',
      NEW.licence_status, v_licence;
  END IF;

  SELECT s INTO v_missing FROM unnest(NEW.source_ids) AS s
   WHERE NOT EXISTS (SELECT 1 FROM pdqe.sources WHERE source_id = s) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'pdqe.datasets: contributing source % not found', v_missing;
  END IF;

  IF EXISTS (SELECT 1 FROM pdqe.sources
              WHERE source_id = ANY (NEW.source_ids) AND licence_status = 'EXCLUDED') THEN
    RAISE EXCEPTION 'pdqe.datasets: a contributing source has licence_status EXCLUDED';
  END IF;

  SELECT e INTO v_missing FROM unnest(NEW.extraction_ids) AS e
   WHERE NOT EXISTS (
     SELECT 1 FROM pdqe.extractions x
      WHERE x.extraction_id = e
        AND x.status = 'VALIDATED'
        AND x.source_id = ANY (NEW.source_ids)
   ) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'pdqe.datasets: extraction % is missing, not VALIDATED, or not from a contributing source',
      v_missing;
  END IF;

  NEW.lifecycle_state := 'DATASET_CREATED';
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdqe_datasets_check_insert
  BEFORE INSERT ON pdqe.datasets
  FOR EACH ROW EXECUTE FUNCTION pdqe.check_dataset_insert();

-- 5b. UPDATE/DELETE on datasets: provenance and hashed fields are immutable;
-- lifecycle_state only moves inside a Stage 07 transition function. Covers
-- service_role too, which bypasses RLS.
CREATE OR REPLACE FUNCTION pdqe.guard_dataset_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pdqe, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pdqe.datasets: DELETE is not permitted (dataset %)', OLD.dataset_id;
  END IF;

  IF NEW.dataset_id IS DISTINCT FROM OLD.dataset_id
     OR NEW.source_ids IS DISTINCT FROM OLD.source_ids
     OR NEW.primary_source_id IS DISTINCT FROM OLD.primary_source_id
     OR NEW.extraction_ids IS DISTINCT FROM OLD.extraction_ids
     OR NEW.domain IS DISTINCT FROM OLD.domain
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.geography_scope IS DISTINCT FROM OLD.geography_scope
     OR NEW.licence_status IS DISTINCT FROM OLD.licence_status
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.dataset_hash IS DISTINCT FROM OLD.dataset_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'pdqe.datasets: provenance and hashed fields are immutable (dataset %)',
      OLD.dataset_id;
  END IF;

  IF NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state
     AND coalesce(current_setting('pdqe.stage07_transition', true), '') != 'on' THEN
    RAISE EXCEPTION 'pdqe.datasets: lifecycle_state changes only via '
      'pdqe.transition_to_collection_linked (dataset %)', OLD.dataset_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdqe_datasets_guard_mutation
  BEFORE UPDATE OR DELETE ON pdqe.datasets
  FOR EACH ROW EXECUTE FUNCTION pdqe.guard_dataset_mutation();

-- 5c. Collections: no DELETE (a dataset link would otherwise dangle — the FK
-- is RESTRICT, this makes the rule explicit for service_role as well).
CREATE OR REPLACE FUNCTION pdqe.guard_collection_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pdqe, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'pdqe.collections: DELETE is not permitted (collection %)', OLD.collection_id;
END;
$$;

CREATE TRIGGER trg_pdqe_collections_guard_delete
  BEFORE DELETE ON pdqe.collections
  FOR EACH ROW EXECUTE FUNCTION pdqe.guard_collection_delete();

-- 5d. dataset_collections: append-only.
CREATE OR REPLACE FUNCTION pdqe.guard_dataset_collection_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pdqe, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'pdqe.dataset_collections: % is not permitted — links are append-only', TG_OP;
END;
$$;

CREATE TRIGGER trg_pdqe_dataset_collections_guard_mutation
  BEFORE UPDATE OR DELETE ON pdqe.dataset_collections
  FOR EACH ROW EXECUTE FUNCTION pdqe.guard_dataset_collection_mutation();

-- 5e. Audit (P7): collection creation and every dataset↔collection link.
CREATE OR REPLACE FUNCTION pdqe.audit_collection_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
BEGIN
  PERFORM pdqe.log_event(
    p_event_type    => 'COLLECTION_CREATED',
    p_actor_type    => 'DETERMINISTIC',
    p_actor_version => 'pdqe-stage07-v0.7.0',
    p_details       => jsonb_build_object(
                         'collection_id', NEW.collection_id,
                         'name', NEW.name,
                         'domain', NEW.domain)
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_pdqe_collections_audit_created
  AFTER INSERT ON pdqe.collections
  FOR EACH ROW EXECUTE FUNCTION pdqe.audit_collection_created();

CREATE OR REPLACE FUNCTION pdqe.audit_dataset_collection_linked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
DECLARE
  v_source UUID;
BEGIN
  SELECT primary_source_id INTO v_source FROM pdqe.datasets WHERE dataset_id = NEW.dataset_id;
  PERFORM pdqe.log_event(
    p_event_type    => 'DATASET_COLLECTION_LINKED',
    p_source_id     => v_source,
    p_actor_type    => 'DETERMINISTIC',
    p_actor_version => 'pdqe-stage07-v0.7.0',
    p_details       => jsonb_build_object(
                         'dataset_id', NEW.dataset_id,
                         'collection_id', NEW.collection_id)
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_pdqe_dataset_collections_audit_linked
  AFTER INSERT ON pdqe.dataset_collections
  FOR EACH ROW EXECUTE FUNCTION pdqe.audit_dataset_collection_linked();

-- ── 6. Transition functions ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pdqe.transition_to_dataset_created(
  p_source_id   UUID,
  p_dataset_id  UUID
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
DECLARE
  v_current_state TEXT;
  v_ds_source     UUID;
  v_ds_hash       TEXT;
  v_ds_version    INTEGER;
  v_row           pdqe.pipeline_state;
BEGIN
  SELECT lifecycle_state INTO v_current_state
    FROM pdqe.sources
   WHERE source_id = p_source_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;
  IF v_current_state != 'APPROVED' THEN
    RAISE EXCEPTION
      'Cannot transition source % to DATASET_CREATED: current state is % (expected APPROVED)',
      p_source_id, v_current_state;
  END IF;

  SELECT primary_source_id, dataset_hash, version INTO v_ds_source, v_ds_hash, v_ds_version
    FROM pdqe.datasets
   WHERE dataset_id = p_dataset_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE dataset not found: %', p_dataset_id;
  END IF;
  IF v_ds_source != p_source_id THEN
    RAISE EXCEPTION 'Dataset % does not have source % as its primary source', p_dataset_id, p_source_id;
  END IF;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, rationale, output_hash
  ) VALUES (
    p_source_id, 'APPROVED', 'DATASET_CREATED',
    'DETERMINISTIC', 'pdqe-stage07-v0.7.0',
    'Dataset ' || p_dataset_id || ' v' || v_ds_version || ' created',
    v_ds_hash
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = 'DATASET_CREATED',
         updated_at      = now()
   WHERE source_id = p_source_id;

  PERFORM pdqe.log_event(
    p_event_type        => 'DATASET_CREATED',
    p_source_id         => p_source_id,
    p_pipeline_state_id => v_row.state_id,
    p_actor_type        => 'DETERMINISTIC',
    p_actor_version     => 'pdqe-stage07-v0.7.0',
    p_details           => jsonb_build_object('dataset_id', p_dataset_id, 'version', v_ds_version),
    p_output_hash       => v_ds_hash
  );

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.transition_to_dataset_created IS
  'Advance a source APPROVED -> DATASET_CREATED once its dataset row exists
   (Stage 07). Appends pipeline_state (actor_type = DETERMINISTIC, output_hash
   = dataset_hash) and audits it. SECURITY DEFINER; EXECUTE granted to
   service_role and pdqe_admin only.';

CREATE OR REPLACE FUNCTION pdqe.transition_to_collection_linked(
  p_source_id   UUID,
  p_dataset_id  UUID
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
DECLARE
  v_current_state TEXT;
  v_ds_source     UUID;
  v_ds_hash       TEXT;
  v_links         INTEGER;
  v_row           pdqe.pipeline_state;
BEGIN
  SELECT lifecycle_state INTO v_current_state
    FROM pdqe.sources
   WHERE source_id = p_source_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;
  IF v_current_state != 'DATASET_CREATED' THEN
    RAISE EXCEPTION
      'Cannot transition source % to COLLECTION_LINKED: current state is % (expected DATASET_CREATED)',
      p_source_id, v_current_state;
  END IF;

  SELECT primary_source_id, dataset_hash INTO v_ds_source, v_ds_hash
    FROM pdqe.datasets
   WHERE dataset_id = p_dataset_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE dataset not found: %', p_dataset_id;
  END IF;
  IF v_ds_source != p_source_id THEN
    RAISE EXCEPTION 'Dataset % does not have source % as its primary source', p_dataset_id, p_source_id;
  END IF;

  SELECT count(*) INTO v_links FROM pdqe.dataset_collections WHERE dataset_id = p_dataset_id;
  IF v_links = 0 THEN
    RAISE EXCEPTION 'Dataset % is not linked to any collection', p_dataset_id;
  END IF;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, rationale, output_hash
  ) VALUES (
    p_source_id, 'DATASET_CREATED', 'COLLECTION_LINKED',
    'DETERMINISTIC', 'pdqe-stage07-v0.7.0',
    'Dataset ' || p_dataset_id || ' linked to ' || v_links || ' collection(s)',
    v_ds_hash
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = 'COLLECTION_LINKED',
         updated_at      = now()
   WHERE source_id = p_source_id;

  -- Transaction-local: lets the guard trigger accept this one state change.
  PERFORM set_config('pdqe.stage07_transition', 'on', true);
  UPDATE pdqe.datasets
     SET lifecycle_state = 'COLLECTION_LINKED'
   WHERE dataset_id = p_dataset_id;
  PERFORM set_config('pdqe.stage07_transition', 'off', true);

  PERFORM pdqe.log_event(
    p_event_type        => 'STATE_TRANSITION',
    p_source_id         => p_source_id,
    p_pipeline_state_id => v_row.state_id,
    p_actor_type        => 'DETERMINISTIC',
    p_actor_version     => 'pdqe-stage07-v0.7.0',
    p_details           => jsonb_build_object('dataset_id', p_dataset_id,
                                              'state_to', 'COLLECTION_LINKED',
                                              'collections', v_links),
    p_output_hash       => v_ds_hash
  );

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.transition_to_collection_linked IS
  'Advance a source DATASET_CREATED -> COLLECTION_LINKED once its dataset is
   linked to at least one collection (Stage 07). Also moves the dataset row to
   COLLECTION_LINKED. SECURITY DEFINER; EXECUTE granted to service_role and
   pdqe_admin only.';

-- ── 7. Row Level Security ──────────────────────────────────────────────────────
-- No DELETE policy for anyone (append-only); guard triggers above also cover
-- service_role, which bypasses RLS.

ALTER TABLE pdqe.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdqe.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdqe.dataset_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdqe_admin_read_datasets"    ON pdqe.datasets FOR SELECT TO pdqe_admin USING (true);
CREATE POLICY "pdqe_admin_insert_datasets"  ON pdqe.datasets FOR INSERT TO pdqe_admin WITH CHECK (true);
CREATE POLICY "pdqe_admin_update_datasets"  ON pdqe.datasets FOR UPDATE TO pdqe_admin USING (true) WITH CHECK (true);
CREATE POLICY "pdqe_reviewer_read_datasets" ON pdqe.datasets FOR SELECT TO pdqe_reviewer USING (true);
CREATE POLICY "service_role_all_datasets"   ON pdqe.datasets FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "pdqe_admin_read_collections"    ON pdqe.collections FOR SELECT TO pdqe_admin USING (true);
CREATE POLICY "pdqe_admin_insert_collections"  ON pdqe.collections FOR INSERT TO pdqe_admin WITH CHECK (true);
CREATE POLICY "pdqe_admin_update_collections"  ON pdqe.collections FOR UPDATE TO pdqe_admin USING (true) WITH CHECK (true);
CREATE POLICY "pdqe_reviewer_read_collections" ON pdqe.collections FOR SELECT TO pdqe_reviewer USING (true);
CREATE POLICY "service_role_all_collections"   ON pdqe.collections FOR ALL TO service_role USING (true) WITH CHECK (true);

-- No UPDATE policy on the link table: links are append-only (guard trigger 5d).
CREATE POLICY "pdqe_admin_read_dataset_collections"    ON pdqe.dataset_collections FOR SELECT TO pdqe_admin USING (true);
CREATE POLICY "pdqe_admin_insert_dataset_collections"  ON pdqe.dataset_collections FOR INSERT TO pdqe_admin WITH CHECK (true);
CREATE POLICY "pdqe_reviewer_read_dataset_collections" ON pdqe.dataset_collections FOR SELECT TO pdqe_reviewer USING (true);
CREATE POLICY "service_role_all_dataset_collections"   ON pdqe.dataset_collections FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 8. Grants ─────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON pdqe.datasets, pdqe.collections TO pdqe_admin;
GRANT SELECT, INSERT ON pdqe.dataset_collections TO pdqe_admin;
GRANT SELECT ON pdqe.datasets, pdqe.collections, pdqe.dataset_collections TO pdqe_reviewer;
GRANT ALL ON pdqe.datasets, pdqe.collections, pdqe.dataset_collections TO service_role;

REVOKE DELETE ON pdqe.datasets, pdqe.collections, pdqe.dataset_collections FROM pdqe_admin, pdqe_reviewer;
REVOKE UPDATE ON pdqe.dataset_collections FROM pdqe_admin;
REVOKE ALL ON pdqe.datasets, pdqe.collections, pdqe.dataset_collections
  FROM pdqe_provider, pdqe_reader, anon, authenticated;

-- Postgres grants EXECUTE on new functions to PUBLIC by default — strip it.
REVOKE ALL ON FUNCTION pdqe.check_dataset_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.guard_dataset_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.guard_collection_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.guard_dataset_collection_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.audit_collection_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.audit_dataset_collection_linked() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_dataset_created(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_collection_linked(UUID, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION pdqe.transition_to_dataset_created(UUID, UUID) TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.transition_to_collection_linked(UUID, UUID) TO service_role, pdqe_admin;

COMMIT;
