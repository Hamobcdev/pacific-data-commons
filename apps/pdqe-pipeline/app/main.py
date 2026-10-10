"""
PDQE Stage 02 — FastAPI skeleton for the secure ingestion pipeline.

No production Claude API calls here (Stage 02 scope). The /ingest/validate
route exercises Layer 1 only — the one layer that is fully implemented in
this stage — so the skeleton is runnable and testable end-to-end for the
part of the pipeline that actually exists so far.
"""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from app.security.layer1_whitelist import Layer1Result, check_layer1

app = FastAPI(title="PDQE Secure Ingestion", version="0.2.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "stage": "02-secure-ingestion"}


class IngestValidateRequest(BaseModel):
    file_name: str
    file_extension: str


@app.post("/ingest/validate", response_model=Layer1Result)
def ingest_validate(payload: IngestValidateRequest) -> Layer1Result:
    """
    Layer 1 only. Does not write to Supabase — persistence happens via the
    pdqe.ingestion_events INSERT path (migration 20261008000005), which
    runs this same whitelist check SQL-side as the authoritative gate.
    This endpoint lets a caller pre-check a file before upload.
    """
    return check_layer1(payload.file_name, payload.file_extension)
