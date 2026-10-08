# PDQE Stage 02 — Secure Ingestion — Session Startup Prompt

**Status:** APPROVED — ready to implement  
**Prerequisite:** Stage 01 (Source Registry) COMPLETE and MERGED — PR merged to main 2026-10-08  
**Author:** Anthony Williams / Synergy Blockchain Pacific  
**Stage 01 baseline:** 4 migrations applied to poiiwcbriqwczmppoevd, 60 pgTAP assertions  
**Bug fixed in Stage 01:** Duplicate (REVIEW, REJECTED) in permitted_transitions — ON CONFLICT DO NOTHING applied  

---

## Step 1 — Read these files before doing anything else

1. `CLAUDE.md` (repo root — authoritative for all PDC constraints)
2. `PDQE_Context_Files/PDQE_Context/PDQE_MASTER_BUILD.md`
3. `PDQE_Context_Files/PDQE_Context/stages/02-secure-ingestion.md`
4. `supabase/migrations/20261008000002_pdqe_sources.sql` (understand sources schema before adding ingestion tables)

Then inspect:
- `supabase/migrations/` — confirm migrations 001–004 exist; next migration is 20261008000005
- Existing workers/pdc-directory-api/ — do not duplicate anything there
- `supabase/tests/01_pdqe_source_registry.sql` — understand test structure before writing Stage 02 tests

Report findings before writing any code.

---

## Repository

Work exclusively in: https://github.com/Hamobcdev/pacific-data-commons  
Branch: `feat/pdqe-stage02-secure-ingestion` (already created — do not create a new one)

**DO NOT** reference or touch `samoa-pacific-blockchain-hub`.

---

## Supabase

PDC Supabase project: `poiiwcbriqwczmppoevd.supabase.co`  
Use this project only. Generate SQL for Anthony to run in SQL Editor — never apply autonomously.

---

## Stage 02 Objective — Five-Layer Upload Security Pipeline (Decision 58)

Every file upload into PDQE passes through all five layers before any Claude API call:

| Layer | Name | What it does |
|-------|------|-------------|
| 1 | File type whitelist | Accept only: PDF, CSV, JSON, XLSX, DOCX, TXT, XML. Reject everything else at the gate. |
| 2 | Content sanitisation | Strip executable code, macros, embedded scripts, and all metadata. Files are treated as untrusted data. |
| 3 | Claude prompt construction | Wrap sanitised content as data — explicit injection-rejection instructions in every prompt. P9: LLM output is untrusted input. |
| 4 | Output schema validation | All Claude output validated against strict JSON schema before any use. Non-conforming output rejected, not retried without human review. |
| 5 | Human review gate | No formatted content stored or deployed without explicit human approval. This gate is non-negotiable. |

**Pricing rule (Decision 27):**
- Internal SBP pipeline: free (OD-4 bypass, `internal_pipeline=TRUE`)
- First dataset per verified external provider: free
- Subsequent external datasets: $25 USDC per dataset
- Scanned PDF surcharge: +$10 USDC
- Charged only AFTER provider approves output — never at upload

---

## Stage 02 Deliverables

**Supabase migrations (starting at 20261008000005):**
1. `pdqe.ingestion_events` table — records every ingestion attempt, layer results, error codes
2. `pdqe.upload_security_log` table — append-only log of all five-layer pipeline results per file
3. Layer 1 enforcement function — file type whitelist check (SQL-side validation)
4. RLS on all new tables from day 0 — same role taxonomy as Stage 01

**Application layer (Python/FastAPI skeleton — no production code yet):**
- Layer 1: file type validation function with whitelist constant
- Layer 2: sanitisation stub (interface only — full implementation Stage 02b)
- Layer 3: prompt construction template (P9 compliant — content as data)
- Layer 4: output schema definition (Pydantic models)
- Layer 5: human review queue interface (returns `pending_review` status)

**Tests (pgTAP — file: `supabase/tests/02_pdqe_secure_ingestion.sql`):**
- ingestion_events table exists with correct columns
- upload_security_log is append-only (trigger + RLS)
- Layer 1 rejects disallowed file types
- Layer 1 accepts all whitelisted types
- RLS enforced per role on new tables
- Existing Stage 01 tests must not regress

**No production Claude API calls in this stage.** Schema, interfaces, and stubs only.

---

## Hard Constraints (every session, no exceptions)

- PR only — never push directly to main
- No `Co-Authored-By: Claude` or AI attribution in commits or PR descriptions
- Supabase READ-ONLY — all SQL requires explicit Anthony approval before running
- P9 — LLM output is untrusted input: every prompt wraps content as data with injection-rejection instructions
- Never call x402 packages directly — always via `pdc-x402-adapter`
- `VITE_FLAG_LIVE_RPC_ACTIVE` must be false in all commits
- Customary land permanently excluded from all functions
- Never hold funds in contracts (P2)
- Upload security pipeline: all 5 layers non-negotiable — no shortcuts

---

## Current Stage Status

| Stage | Description | Status |
|-------|-------------|--------|
| 00 | Architecture Assessment | DELIVERED and APPROVED 2026-10-08 |
| 01 | Source Registry | COMPLETE — merged to main 2026-10-08 |
| 02 | Secure Ingestion | **APPROVED — implement this session** |
| 03 | Claude Extraction | Not yet approved |
| 04 | Jev Qualification | BLOCKED — TypeSafe API key pending |
| 05–11 | Remaining stages | Not yet approved |

Do not silently advance to Stage 03. Report completion and await approval.

---

## Next Migration Filename

`20261008000005_pdqe_ingestion_events.sql`
