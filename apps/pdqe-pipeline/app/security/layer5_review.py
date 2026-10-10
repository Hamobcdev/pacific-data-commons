"""
PDQE Stage 02 — Layer 5: Human review queue interface.

No formatted content is stored or deployed without explicit human approval
(Decision 58 — this gate is non-negotiable). This module only defines the
queue interface; the actual review UI/workflow is a later stage.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.models.schemas import ExtractedSourceMetadata

ReviewStatus = str  # "pending_review" | "approved" | "rejected" — Literal in a later stage


@dataclass(frozen=True)
class ReviewQueueEntry:
    ingestion_id: UUID
    extracted: ExtractedSourceMetadata
    status: ReviewStatus


def queue_for_human_review(
    ingestion_id: UUID, extracted: ExtractedSourceMetadata
) -> ReviewQueueEntry:
    """
    Place Layer 4's validated output in front of a human reviewer.

    Always returns status "pending_review" — there is no code path in this
    stage that marks an upload approved or rejected. That decision belongs
    to pdqe_reviewer, recorded via pdqe.transition_source_state() and
    pdqe.log_security_check(ingestion_id, 'LAYER5_HUMAN_REVIEW', ...), not
    to this function.
    """
    return ReviewQueueEntry(
        ingestion_id=ingestion_id,
        extracted=extracted,
        status="pending_review",
    )
