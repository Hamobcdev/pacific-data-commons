-- ============================================================================
-- PDQE Stage 09 — Migration 1 of 1
-- PDC integration: endpoint validation, provider approval, publication,
-- x402 registration
--
--   ENDPOINT_GENERATED → ENDPOINT_VALIDATED   (pdqe.transition_to_endpoint_validated)
--   ENDPOINT_VALIDATED → PROVIDER_APPROVED    (pdqe.transition_to_provider_approved)
--   PROVIDER_APPROVED  → PUBLISHED            (pdqe.transition_to_published)
--   PUBLISHED          → x402_QUERYABLE       (pdqe.transition_to_x402_queryable)
--
-- Endpoint status (pdqe.endpoint_status) moves DRAFT → VALIDATED at endpoint
-- validation and VALIDATED → PUBLISHED at SBP publication. Provider approval
-- does not change the status: it stamps provider_approved_at and fixes the
-- provider wallet, price and endpoint hash. x402 registration does not change
-- the status either: it stamps x402_registration_id / x402_registered_at.
--
-- PDQE hands off to PDC at PUBLISHED → x402_QUERYABLE. Payment routing is
-- direct to provider_wallet (P2 — SBP never holds funds); nothing here
-- custodies value.
--
-- Reference: PDQE_MASTER_BUILD.md, Stage 09, P2, P7, P9
-- Depends on: 20261008000003_pdqe_pipeline_state.sql
--             20261008000004_pdqe_audit_log.sql (pdqe.log_event)
--             20261012000004_pdqe_endpoints.sql
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-12
--
-- ADDITIVE ONLY. No existing function or trigger is replaced. Confirmed
-- against the live DB before writing:
--   * all four permitted transitions are already seeded (idempotent no-ops);
--   * pdqe.sources / pdqe.pipeline_state lifecycle CHECKs already allow
--     ENDPOINT_VALIDATED, PROVIDER_APPROVED, PUBLISHED, x402_QUERYABLE;
--   * audit_event_type already has ENDPOINT_VALIDATED, ENDPOINT_PUBLISHED and
--     X402_REGISTERED — reused here; only PROVIDER_APPROVED is new;
--   * actor_type has no PROVIDER value — provider approval is recorded as
--     HUMAN with the provider role named in the rationale;
--   * pdqe.endpoints has 0 rows, so the new CHECK constraints apply cleanly.
-- ============================================================================

BEGIN;

-- ── 1. Permitted transitions and audit event type ────────────────────────────

INSERT INTO pdqe.permitted_transitions (state_from, state_to) VALUES
  ('ENDPOINT_GENERATED', 'ENDPOINT_VALIDATED'),
  ('ENDPOINT_VALIDATED', 'PROVIDER_APPROVED'),
  ('PROVIDER_APPROVED',  'PUBLISHED'),
  ('PUBLISHED',          'x402_QUERYABLE')
ON CONFLICT (state_from, state_to) DO NOTHING;

ALTER TYPE pdqe.audit_event_type ADD VALUE IF NOT EXISTS 'ENDPOINT_VALIDATED';
ALTER TYPE pdqe.audit_event_type ADD VALUE IF NOT EXISTS 'PROVIDER_APPROVED';
ALTER TYPE pdqe.audit_event_type ADD VALUE IF NOT EXISTS 'ENDPOINT_PUBLISHED';
ALTER TYPE pdqe.audit_event_type ADD VALUE IF NOT EXISTS 'X402_REGISTERED';

-- ── 2. New columns on pdqe.endpoints ──────────────────────────────────────────

ALTER TABLE pdqe.endpoints
  ADD COLUMN IF NOT EXISTS provider_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS x402_registration_id TEXT,
  ADD COLUMN IF NOT EXISTS x402_registered_at   TIMESTAMPTZ;

COMMENT ON COLUMN pdqe.endpoints.provider_approved_at IS
  'Set once by pdqe.transition_to_provider_approved. After it is set,
   provider_wallet, price_usdc and endpoint_hash are frozen.';
COMMENT ON COLUMN pdqe.endpoints.x402_registration_id IS
  'Registration id returned by pdc-x402-adapter (prefixed "mock-" when the
   pipeline ran with VITE_FLAG_LIVE_RPC_ACTIVE=false). Set once by
   pdqe.transition_to_x402_queryable.';
COMMENT ON COLUMN pdqe.endpoints.x402_registered_at IS
  'Set once by pdqe.transition_to_x402_queryable.';

ALTER TABLE pdqe.endpoints
  ADD CONSTRAINT endpoints_x402_registration_id_format CHECK (
    x402_registration_id IS NULL OR x402_registration_id ~ '^[A-Za-z0-9._:-]{1,128}$'
  ),
  ADD CONSTRAINT endpoints_x402_registration_pair CHECK (
    (x402_registration_id IS NULL) = (x402_registered_at IS NULL)
  ),
  ADD CONSTRAINT endpoints_published_needs_provider_approval CHECK (
    status != 'PUBLISHED' OR provider_approved_at IS NOT NULL
  ),
  ADD CONSTRAINT endpoints_x402_needs_publication CHECK (
    x402_registration_id IS NULL OR status IN ('PUBLISHED', 'DEPRECATED')
  );

-- Stage 09 fields are set-once, and the provider's approved terms are frozen.
-- Separate trigger so the Stage 08 guard is not modified. Covers
-- service_role too, which bypasses RLS.
CREATE OR REPLACE FUNCTION pdqe.guard_endpoint_integration_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pdqe, pg_temp
AS $$
BEGIN
  IF (OLD.provider_approved_at IS NOT NULL AND NEW.provider_approved_at IS DISTINCT FROM OLD.provider_approved_at)
     OR (OLD.x402_registration_id IS NOT NULL AND NEW.x402_registration_id IS DISTINCT FROM OLD.x402_registration_id)
     OR (OLD.x402_registered_at IS NOT NULL AND NEW.x402_registered_at IS DISTINCT FROM OLD.x402_registered_at) THEN
    RAISE EXCEPTION 'pdqe.endpoints: provider approval and x402 registration fields are set-once (endpoint %)',
      OLD.endpoint_id;
  END IF;

  IF OLD.provider_approved_at IS NOT NULL AND (
       NEW.provider_wallet IS DISTINCT FROM OLD.provider_wallet
    OR NEW.price_usdc IS DISTINCT FROM OLD.price_usdc
    OR NEW.endpoint_hash IS DISTINCT FROM OLD.endpoint_hash) THEN
    RAISE EXCEPTION 'pdqe.endpoints: wallet, price and hash are frozen after provider approval (endpoint %)',
      OLD.endpoint_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdqe_endpoints_guard_integration
  BEFORE UPDATE ON pdqe.endpoints
  FOR EACH ROW EXECUTE FUNCTION pdqe.guard_endpoint_integration_fields();

-- ── 3. Transition functions ───────────────────────────────────────────────────
-- Each one locks the source, checks its state, checks the endpoint belongs to
-- the source's dataset (primary source), updates the endpoint, appends
-- pipeline_state, advances the source and audits — in one transaction.

-- 3a. ENDPOINT_GENERATED → ENDPOINT_VALIDATED (endpoint DRAFT → VALIDATED)
CREATE OR REPLACE FUNCTION pdqe.transition_to_endpoint_validated(
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
  v_ep            pdqe.endpoints;
  v_ds_source     UUID;
  v_row           pdqe.pipeline_state;
BEGIN
  SELECT lifecycle_state INTO v_current_state
    FROM pdqe.sources WHERE source_id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;
  IF v_current_state != 'ENDPOINT_GENERATED' THEN
    RAISE EXCEPTION
      'Cannot transition source % to ENDPOINT_VALIDATED: current state is % (expected ENDPOINT_GENERATED)',
      p_source_id, v_current_state;
  END IF;

  SELECT * INTO v_ep FROM pdqe.endpoints WHERE endpoint_id = p_endpoint_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE endpoint not found: %', p_endpoint_id;
  END IF;
  SELECT primary_source_id INTO v_ds_source FROM pdqe.datasets WHERE dataset_id = v_ep.dataset_id;
  IF v_ds_source IS DISTINCT FROM p_source_id THEN
    RAISE EXCEPTION 'Endpoint % dataset does not have source % as its primary source',
      p_endpoint_id, p_source_id;
  END IF;
  IF v_ep.status != 'DRAFT' THEN
    RAISE EXCEPTION 'Endpoint % is % (expected DRAFT)', p_endpoint_id, v_ep.status;
  END IF;

  UPDATE pdqe.endpoints
     SET status = 'VALIDATED', updated_at = now()
   WHERE endpoint_id = p_endpoint_id;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, rationale, output_hash
  ) VALUES (
    p_source_id, 'ENDPOINT_GENERATED', 'ENDPOINT_VALIDATED',
    'DETERMINISTIC', 'pdqe-stage09-v0.9.0',
    'Endpoint ' || p_endpoint_id || ' at ' || v_ep.path || ' passed automated validation',
    v_ep.endpoint_hash
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = 'ENDPOINT_VALIDATED', updated_at = now()
   WHERE source_id = p_source_id;

  PERFORM pdqe.log_event(
    p_event_type        => 'ENDPOINT_VALIDATED',
    p_source_id         => p_source_id,
    p_pipeline_state_id => v_row.state_id,
    p_actor_type        => 'DETERMINISTIC',
    p_actor_version     => 'pdqe-stage09-v0.9.0',
    p_details           => jsonb_build_object('endpoint_id', p_endpoint_id, 'path', v_ep.path),
    p_output_hash       => v_ep.endpoint_hash
  );

  RETURN v_row;
END;
$$;

-- 3b. ENDPOINT_VALIDATED → PROVIDER_APPROVED (endpoint stays VALIDATED;
-- wallet, price and recomputed hash are fixed and provider_approved_at set)
CREATE OR REPLACE FUNCTION pdqe.transition_to_provider_approved(
  p_source_id        UUID,
  p_endpoint_id      UUID,
  p_provider_wallet  TEXT,
  p_price_usdc       NUMERIC(10,4),
  p_endpoint_hash    TEXT
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
DECLARE
  v_current_state TEXT;
  v_ep            pdqe.endpoints;
  v_ds_source     UUID;
  v_floor         NUMERIC(10,4);
  v_row           pdqe.pipeline_state;
BEGIN
  SELECT lifecycle_state INTO v_current_state
    FROM pdqe.sources WHERE source_id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;
  IF v_current_state != 'ENDPOINT_VALIDATED' THEN
    RAISE EXCEPTION
      'Cannot transition source % to PROVIDER_APPROVED: current state is % (expected ENDPOINT_VALIDATED)',
      p_source_id, v_current_state;
  END IF;

  SELECT * INTO v_ep FROM pdqe.endpoints WHERE endpoint_id = p_endpoint_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE endpoint not found: %', p_endpoint_id;
  END IF;
  SELECT primary_source_id INTO v_ds_source FROM pdqe.datasets WHERE dataset_id = v_ep.dataset_id;
  IF v_ds_source IS DISTINCT FROM p_source_id THEN
    RAISE EXCEPTION 'Endpoint % dataset does not have source % as its primary source',
      p_endpoint_id, p_source_id;
  END IF;
  IF v_ep.status != 'VALIDATED' THEN
    RAISE EXCEPTION 'Endpoint % is % (expected VALIDATED)', p_endpoint_id, v_ep.status;
  END IF;
  IF v_ep.provider_approved_at IS NOT NULL THEN
    RAISE EXCEPTION 'Endpoint % was already approved at %', p_endpoint_id, v_ep.provider_approved_at;
  END IF;

  IF p_provider_wallet IS NULL OR p_provider_wallet !~ '^[A-Z2-7]{58}$' THEN
    RAISE EXCEPTION 'Provider wallet is not a valid Algorand address';
  END IF;
  v_floor := pdqe.pricing_tier_default_price(v_ep.pricing_tier);
  IF p_price_usdc IS NULL OR p_price_usdc < v_floor THEN
    RAISE EXCEPTION 'Price % is below the % tier floor %', p_price_usdc, v_ep.pricing_tier, v_floor;
  END IF;
  IF p_endpoint_hash IS NULL OR p_endpoint_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Endpoint hash must be 64 lowercase hex characters';
  END IF;

  UPDATE pdqe.endpoints
     SET provider_wallet      = p_provider_wallet,
         price_usdc           = p_price_usdc,
         endpoint_hash        = p_endpoint_hash,
         provider_approved_at = now(),
         updated_at           = now()
   WHERE endpoint_id = p_endpoint_id;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, rationale, input_hash, output_hash
  ) VALUES (
    p_source_id, 'ENDPOINT_VALIDATED', 'PROVIDER_APPROVED',
    'HUMAN', 'pdqe-stage09-v0.9.0',
    'Provider approved endpoint ' || p_endpoint_id || ' at ' || p_price_usdc || ' USDC/query',
    v_ep.endpoint_hash, p_endpoint_hash
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = 'PROVIDER_APPROVED', updated_at = now()
   WHERE source_id = p_source_id;

  PERFORM pdqe.log_event(
    p_event_type        => 'PROVIDER_APPROVED',
    p_source_id         => p_source_id,
    p_pipeline_state_id => v_row.state_id,
    p_actor_type        => 'HUMAN',
    p_actor_version     => 'pdqe-stage09-v0.9.0',
    p_details           => jsonb_build_object('endpoint_id', p_endpoint_id,
                                              'actor_role', 'PROVIDER',
                                              'provider_wallet', p_provider_wallet,
                                              'price_usdc', p_price_usdc,
                                              'previous_price_usdc', v_ep.price_usdc),
    p_input_hash        => v_ep.endpoint_hash,
    p_output_hash       => p_endpoint_hash
  );

  RETURN v_row;
END;
$$;

-- 3c. PROVIDER_APPROVED → PUBLISHED (endpoint VALIDATED → PUBLISHED). SBP admin.
CREATE OR REPLACE FUNCTION pdqe.transition_to_published(
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
  v_ep            pdqe.endpoints;
  v_ds_source     UUID;
  v_row           pdqe.pipeline_state;
BEGIN
  SELECT lifecycle_state INTO v_current_state
    FROM pdqe.sources WHERE source_id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;
  IF v_current_state != 'PROVIDER_APPROVED' THEN
    RAISE EXCEPTION
      'Cannot transition source % to PUBLISHED: current state is % (expected PROVIDER_APPROVED)',
      p_source_id, v_current_state;
  END IF;

  SELECT * INTO v_ep FROM pdqe.endpoints WHERE endpoint_id = p_endpoint_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE endpoint not found: %', p_endpoint_id;
  END IF;
  SELECT primary_source_id INTO v_ds_source FROM pdqe.datasets WHERE dataset_id = v_ep.dataset_id;
  IF v_ds_source IS DISTINCT FROM p_source_id THEN
    RAISE EXCEPTION 'Endpoint % dataset does not have source % as its primary source',
      p_endpoint_id, p_source_id;
  END IF;
  IF v_ep.status != 'VALIDATED' THEN
    RAISE EXCEPTION 'Endpoint % is % (expected VALIDATED)', p_endpoint_id, v_ep.status;
  END IF;
  IF v_ep.provider_approved_at IS NULL THEN
    RAISE EXCEPTION 'Endpoint % has not been approved by its provider', p_endpoint_id;
  END IF;
  IF v_ep.provider_wallet IS NULL THEN
    RAISE EXCEPTION 'Endpoint % has no provider wallet', p_endpoint_id;
  END IF;

  UPDATE pdqe.endpoints
     SET status = 'PUBLISHED', updated_at = now()
   WHERE endpoint_id = p_endpoint_id;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, rationale, output_hash
  ) VALUES (
    p_source_id, 'PROVIDER_APPROVED', 'PUBLISHED',
    'HUMAN', 'pdqe-stage09-v0.9.0',
    'SBP admin published endpoint ' || p_endpoint_id || ' at ' || v_ep.path,
    v_ep.endpoint_hash
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = 'PUBLISHED', updated_at = now()
   WHERE source_id = p_source_id;

  PERFORM pdqe.log_event(
    p_event_type        => 'ENDPOINT_PUBLISHED',
    p_source_id         => p_source_id,
    p_pipeline_state_id => v_row.state_id,
    p_actor_type        => 'HUMAN',
    p_actor_version     => 'pdqe-stage09-v0.9.0',
    p_details           => jsonb_build_object('endpoint_id', p_endpoint_id,
                                              'actor_role', 'SBP_ADMIN',
                                              'path', v_ep.path,
                                              'provider_wallet', v_ep.provider_wallet,
                                              'price_usdc', v_ep.price_usdc),
    p_output_hash       => v_ep.endpoint_hash
  );

  RETURN v_row;
END;
$$;

-- 3d. PUBLISHED → x402_QUERYABLE (endpoint stays PUBLISHED; registration
-- metadata recorded). This is the PDQE → PDC handoff.
CREATE OR REPLACE FUNCTION pdqe.transition_to_x402_queryable(
  p_source_id             UUID,
  p_endpoint_id           UUID,
  p_x402_registration_id  TEXT
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
DECLARE
  v_current_state TEXT;
  v_ep            pdqe.endpoints;
  v_ds_source     UUID;
  v_row           pdqe.pipeline_state;
BEGIN
  SELECT lifecycle_state INTO v_current_state
    FROM pdqe.sources WHERE source_id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;
  IF v_current_state != 'PUBLISHED' THEN
    RAISE EXCEPTION
      'Cannot transition source % to x402_QUERYABLE: current state is % (expected PUBLISHED)',
      p_source_id, v_current_state;
  END IF;

  SELECT * INTO v_ep FROM pdqe.endpoints WHERE endpoint_id = p_endpoint_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE endpoint not found: %', p_endpoint_id;
  END IF;
  SELECT primary_source_id INTO v_ds_source FROM pdqe.datasets WHERE dataset_id = v_ep.dataset_id;
  IF v_ds_source IS DISTINCT FROM p_source_id THEN
    RAISE EXCEPTION 'Endpoint % dataset does not have source % as its primary source',
      p_endpoint_id, p_source_id;
  END IF;
  IF v_ep.status != 'PUBLISHED' THEN
    RAISE EXCEPTION 'Endpoint % is % (expected PUBLISHED)', p_endpoint_id, v_ep.status;
  END IF;
  IF v_ep.x402_registration_id IS NOT NULL THEN
    RAISE EXCEPTION 'Endpoint % is already registered (%)', p_endpoint_id, v_ep.x402_registration_id;
  END IF;
  IF p_x402_registration_id IS NULL OR p_x402_registration_id !~ '^[A-Za-z0-9._:-]{1,128}$' THEN
    RAISE EXCEPTION 'x402 registration id is malformed';
  END IF;

  UPDATE pdqe.endpoints
     SET x402_registration_id = p_x402_registration_id,
         x402_registered_at   = now(),
         updated_at           = now()
   WHERE endpoint_id = p_endpoint_id;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, rationale, input_hash, output_hash
  ) VALUES (
    p_source_id, 'PUBLISHED', 'x402_QUERYABLE',
    'DETERMINISTIC', 'pdqe-stage09-v0.9.0',
    'Endpoint ' || p_endpoint_id || ' registered with x402 via pdc-x402-adapter',
    v_ep.endpoint_hash, p_x402_registration_id
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = 'x402_QUERYABLE', updated_at = now()
   WHERE source_id = p_source_id;

  PERFORM pdqe.log_event(
    p_event_type        => 'X402_REGISTERED',
    p_source_id         => p_source_id,
    p_pipeline_state_id => v_row.state_id,
    p_actor_type        => 'DETERMINISTIC',
    p_actor_version     => 'pdqe-stage09-v0.9.0',
    p_details           => jsonb_build_object('endpoint_id', p_endpoint_id,
                                              'path', v_ep.path,
                                              'x402_registration_id', p_x402_registration_id,
                                              'mock', p_x402_registration_id LIKE 'mock-%'),
    p_input_hash        => v_ep.endpoint_hash,
    p_output_hash       => p_x402_registration_id
  );

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.transition_to_endpoint_validated IS
  'Stage 09: ENDPOINT_GENERATED -> ENDPOINT_VALIDATED; endpoint DRAFT -> VALIDATED.
   SECURITY DEFINER; EXECUTE granted to service_role and pdqe_admin only.';
COMMENT ON FUNCTION pdqe.transition_to_provider_approved IS
  'Stage 09: ENDPOINT_VALIDATED -> PROVIDER_APPROVED. Sets provider_wallet,
   price_usdc (>= tier floor), recomputed endpoint_hash and
   provider_approved_at; these are then frozen. SECURITY DEFINER; EXECUTE
   granted to service_role and pdqe_admin only.';
COMMENT ON FUNCTION pdqe.transition_to_published IS
  'Stage 09: PROVIDER_APPROVED -> PUBLISHED; endpoint VALIDATED -> PUBLISHED.
   SBP admin action. SECURITY DEFINER; EXECUTE granted to service_role and
   pdqe_admin only.';
COMMENT ON FUNCTION pdqe.transition_to_x402_queryable IS
  'Stage 09: PUBLISHED -> x402_QUERYABLE. Records the pdc-x402-adapter
   registration id. PDQE -> PDC handoff point. SECURITY DEFINER; EXECUTE
   granted to service_role and pdqe_admin only.';

-- ── 4. Grants ─────────────────────────────────────────────────────────────────
-- Postgres grants EXECUTE on new functions to PUBLIC by default — strip it.

REVOKE ALL ON FUNCTION pdqe.guard_endpoint_integration_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_endpoint_validated(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_provider_approved(UUID, UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_published(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_x402_queryable(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION pdqe.transition_to_endpoint_validated(UUID, UUID) TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.transition_to_provider_approved(UUID, UUID, TEXT, NUMERIC, TEXT) TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.transition_to_published(UUID, UUID) TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.transition_to_x402_queryable(UUID, UUID, TEXT) TO service_role, pdqe_admin;

COMMIT;
