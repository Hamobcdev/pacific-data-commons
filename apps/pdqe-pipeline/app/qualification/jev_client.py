"""
PDQE Stage 04 — Jev Client.

Wraps the TypeSafe Jev API. Single interface for all three question types —
no other module in app.qualification calls the TypeSafe API directly.

JEV_MOCK_MODE=true  -> deterministic mock (CI and dev without a TypeSafe key).
JEV_MOCK_MODE=false (default) -> real TypeSafe API call.

The mock produces deterministic results based on a hash of the question id
and context string, so tests are reproducible without a live API key.

P9: every value returned to a caller here has already been range- and
membership-validated — a Jev response that violates its contract (an
out-of-range probability, a score outside 0..max_score, a choice value not
in the offered set) raises ValueError rather than being silently clamped.

Real API: https://docs.typesafe.ai
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

CURRENT_JEV_MODEL_VERSION = "jev-1"


class JevClient:
    """
    Single entry point for all Jev question types.
    Use JevClient.from_env() to build from environment variables.
    """

    def __init__(self, api_key: str | None = None, mock_mode: bool = False):
        self.mock_mode = mock_mode
        self._api_key = api_key
        self._client: Any = None

        if not mock_mode:
            if not api_key:
                raise ValueError(
                    "TYPESAFE_API_KEY is required when JEV_MOCK_MODE is not 'true'. "
                    "Set JEV_MOCK_MODE=true for development without a TypeSafe key."
                )
            try:
                import typesafe  # type: ignore[import]  # TypeSafe Python SDK

                self._client = typesafe.Client(api_key=api_key)
                logger.info("JevClient initialised in LIVE mode (TypeSafe API)")
            except ImportError as exc:
                raise ImportError(
                    "typesafe package not installed. Add 'typesafe' to requirements.txt "
                    "or set JEV_MOCK_MODE=true."
                ) from exc
        else:
            logger.info("JevClient initialised in MOCK mode (deterministic mock — no API calls)")

    @classmethod
    def from_env(cls) -> JevClient:
        """Build from environment variables. Safe to call at startup."""
        mock_mode = os.getenv("JEV_MOCK_MODE", "false").lower() == "true"
        api_key = os.getenv("TYPESAFE_API_KEY")
        return cls(api_key=api_key, mock_mode=mock_mode)

    # -- Public interface -----------------------------------------------------

    async def noul(self, question_id: str, question_text: str, context: str) -> float:
        """Yes/no probability question. Returns float 0.0-1.0."""
        if self.mock_mode:
            return self._mock_noul(question_id, context)
        probability = float(await self._real_noul(question_text, context))
        if not (0.0 <= probability <= 1.0):
            raise ValueError(f"Jev noul '{question_id}' returned out-of-range probability: {probability}")
        return probability

    async def choice(
        self, question_id: str, question_text: str, choices: list[str], context: str
    ) -> tuple[str, float]:
        """Category selection. Returns (chosen_value, confidence 0.0-1.0)."""
        if self.mock_mode:
            return self._mock_choice(question_id, choices, context)
        value, confidence = await self._real_choice(question_text, choices, context)
        if value not in choices:
            raise ValueError(f"Jev choice '{question_id}' returned value '{value}' not in choices: {choices}")
        confidence = float(confidence)
        if not (0.0 <= confidence <= 1.0):
            raise ValueError(f"Jev choice '{question_id}' confidence out of range: {confidence}")
        return value, confidence

    async def score(self, question_id: str, question_text: str, max_score: int, context: str) -> int:
        """Ordered scale (0 to max_score). Returns int."""
        if self.mock_mode:
            return self._mock_score(question_id, max_score, context)
        score = int(await self._real_score(question_text, max_score, context))
        if not (0 <= score <= max_score):
            raise ValueError(f"Jev score '{question_id}' = {score} out of range 0-{max_score}")
        return score

    # -- Real API calls ---------------------------------------------------------

    async def _real_noul(self, question_text: str, context: str) -> float:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, self._client.noul, question_text, context)
        return result.probability

    async def _real_choice(self, question_text: str, choices: list[str], context: str) -> tuple[str, float]:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, self._client.choice, question_text, choices, context)
        return result.value, result.confidence

    async def _real_score(self, question_text: str, max_score: int, context: str) -> int:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, self._client.score, question_text, max_score, context)
        return result.value

    # -- Deterministic mock ------------------------------------------------------

    def _hash_seed(self, question_id: str, context: str) -> int:
        """Stable hash for deterministic mock output. Same inputs -> same output always."""
        digest = hashlib.sha256(f"{question_id}:{context[:200]}".encode("utf-8")).hexdigest()
        return int(digest[:8], 16)

    def _mock_noul(self, question_id: str, context: str) -> float:
        """
        Deterministic mock for noul questions. Produces values in the 0.70-0.95
        range — realistic enough to exercise the auto-approve path in tests,
        reproducible across runs via the context hash.
        """
        seed = self._hash_seed(question_id, context)
        base = 0.70 + (seed % 1000) / 4000.0
        return round(min(base, 1.0), 4)

    def _mock_choice(self, question_id: str, choices: list[str], context: str) -> tuple[str, float]:
        seed = self._hash_seed(question_id, context)
        chosen = choices[seed % len(choices)]
        confidence = round(min(0.75 + (seed % 500) / 2000.0, 1.0), 4)
        return chosen, confidence

    def _mock_score(self, question_id: str, max_score: int, context: str) -> int:
        seed = self._hash_seed(question_id, context)
        # Produce scores in the top two bands for realistic auto-approve testing.
        return 2 + (seed % (max_score - 1))
