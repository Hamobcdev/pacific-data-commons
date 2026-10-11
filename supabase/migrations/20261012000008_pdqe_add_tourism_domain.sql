-- PDQE Stage 10.1 — TOURISM domain. Additive only. Safe to run on live database.
-- domain_classification: Jev / datasets / collections / endpoints / dogfood_runs.
-- source_domain: pdqe.sources.candidate_domains (mirrors domain_classification minus NONE_OF_THE_ABOVE).
-- Applied to poiiwcbriqwczmppoevd on 2026-10-11 (approved: "confirmed — run this").
ALTER TYPE pdqe.domain_classification ADD VALUE IF NOT EXISTS 'TOURISM';
ALTER TYPE pdqe.source_domain ADD VALUE IF NOT EXISTS 'TOURISM';
