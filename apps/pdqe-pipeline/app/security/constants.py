"""
PDQE Stage 02 — Layer 1 whitelist constants.

Mirrors supabase/migrations/20261008000005_pdqe_ingestion_events.sql's
pdqe.validate_file_type() exactly. If either side changes, change both —
there is one whitelist, enforced twice (defence in depth), never two
whitelists that can drift apart.
"""

ALLOWED_FILE_EXTENSIONS: frozenset[str] = frozenset(
    {"pdf", "csv", "json", "xlsx", "docx", "txt", "xml"}
)
