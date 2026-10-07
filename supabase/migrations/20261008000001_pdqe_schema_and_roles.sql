-- ============================================================================
-- PDQE Stage 01 — Migration 1 of 4
-- Schema and role creation for the Pacific Data Qualification Engine
--
-- Reference: PDQE_MASTER_BUILD.md, Stage 01 startup prompt (OD-2, OD-3)
-- Decision: Separate `pdqe` schema (not public schema with pdqe_ prefix)
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-08
--
-- ADDITIVE ONLY — does not alter any existing PDC tables
-- ============================================================================

-- ── 1. Schema ────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS pdqe;

COMMENT ON SCHEMA pdqe IS
  'Pacific Data Qualification Engine — internal data production pipeline.
   All PDQE tables live under this schema, isolated from PDC public schema tables.
   Created: 2026-10-08. Reference: PDQE_MASTER_BUILD.md Stage 01.';

-- ── 2. Roles ─────────────────────────────────────────────────────────────────
-- Define all four roles from day one (OD-3 — RESOLVED).
-- pdqe_admin and pdqe_reviewer are ACTIVE for Stages 01–09.
-- pdqe_provider and pdqe_reader are defined now, activated at Stage 11.
-- These are Postgres roles used in RLS policies; they are separate from
-- Supabase auth.users — the application maps auth.uid() → pdqe role via
-- pdqe.operator_roles (created in migration 3, audit_log).

-- NOTE: DO NOT USE IF NOT EXISTS on CREATE ROLE — not valid Postgres syntax.
-- Guard with a DO block to avoid errors if roles already exist.
DO $$
BEGIN
  -- pdqe_admin: Full pipeline access.
  -- Can register sources, approve datasets, manage all pipeline stages,
  -- override any state. Anthony / SBP team for Stages 01–09.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pdqe_admin') THEN
    CREATE ROLE pdqe_admin;
  END IF;

  -- pdqe_reviewer: Human review queue only.
  -- Can approve or reject datasets flagged for human judgment.
  -- Cannot create sources or generate endpoints.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pdqe_reviewer') THEN
    CREATE ROLE pdqe_reviewer;
  END IF;

  -- pdqe_provider: External data providers (Stage 11 only, not yet active).
  -- Can submit data and view their own submissions only.
  -- Cannot see other providers' data.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pdqe_provider') THEN
    CREATE ROLE pdqe_provider;
  END IF;

  -- pdqe_reader: Read-only API layer consumers (not a person).
  -- Read access to published endpoint metadata only.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pdqe_reader') THEN
    CREATE ROLE pdqe_reader;
  END IF;
END $$;

-- ── 3. Grant schema usage ─────────────────────────────────────────────────────
-- All roles need USAGE on the pdqe schema to access its tables.
-- Specific table-level grants are applied in each table's migration.
GRANT USAGE ON SCHEMA pdqe TO pdqe_admin, pdqe_reviewer, pdqe_provider, pdqe_reader;

-- authenticated and service_role need schema access for Supabase RLS + PostgREST
GRANT USAGE ON SCHEMA pdqe TO authenticated, service_role, anon;
