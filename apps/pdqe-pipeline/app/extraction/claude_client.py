"""
PDQE Stage 03 — Claude API client.

Wraps the Anthropic messages API for PDQE extraction calls.

Design decisions:
  - One call per extraction request; no streaming (we need the full JSON).
  - Temperature = 0 for deterministic, repeatable extraction.
  - max_tokens is deliberately conservative — extraction output is structured
    JSON, not prose. If Claude needs more tokens to fit the output, that is
    a signal the document is too large (split at Layer 2).
  - The model is read from ANTHROPIC_MODEL env var so it can be updated via
    Render config without a code deploy.
  - Raw API response is returned as a dict so Layer 4 validation is the next
    and only step before any field is used.
  - No retry logic here: P9 says non-conforming output requires a human
    decision, not an automatic retry.

P9: the dict returned from here goes straight to validate_extraction_output().
It is never executed, never interpreted as instructions, never passed to
eval(), exec(), or any template engine before validation passes.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass

import anthropic

from app.security.layer3_prompt import PromptPayload

logger = logging.getLogger(__name__)

# Default model — overridable via environment variable
DEFAULT_MODEL = "claude-sonnet-4-6"

# Token budget for extraction output.
# Large API datasets (e.g. WHO GHO OData responses) can produce extraction
# schemas with many variables and table entries. 4 096 tokens comfortably fits
# the full ExtractionOutput JSON even for rich multi-variable datasets.
# Layer 2 now applies smart_sample() before passing content to Stage 03, so
# the *input* token cost is bounded; this cap guards *output* cost only.
MAX_TOKENS = 4096


@dataclass(frozen=True)
class ClaudeCallResult:
    """Raw result of a Claude API call — not yet Layer 4 validated."""

    raw_output: dict  # parsed JSON from Claude's text response
    model_id: str     # model identifier from the API response
    stop_reason: str  # 'end_turn', 'max_tokens', etc.
    input_tokens: int
    output_tokens: int


class ExtractionClientError(Exception):
    """Raised when the Claude API call itself fails (network, auth, etc.)."""


class ExtractionOutputParseError(Exception):
    """
    Raised when Claude's text response is not valid JSON.

    This is distinct from a Layer 4 schema validation failure — the text
    arrived but could not be parsed as JSON at all.
    """

    def __init__(self, message: str, raw_text: str) -> None:
        super().__init__(message)
        self.raw_text = raw_text


def get_model() -> str:
    """Return the configured Claude model ID."""
    return os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)


def call_claude_extraction(prompt: PromptPayload) -> ClaudeCallResult:
    """
    Send a Layer 3 extraction prompt to the Claude API and return the raw
    parsed JSON output.

    Args:
        prompt: A PromptPayload from build_extraction_prompt(). The system
                prompt includes injection-rejection instructions; the user
                prompt wraps the untrusted document.

    Returns:
        ClaudeCallResult with raw_output as a dict (not yet validated).

    Raises:
        ExtractionClientError: API call failed (network, auth, rate limit).
        ExtractionOutputParseError: Claude returned text that is not valid JSON.

    P9: raw_output is returned as-is. The caller MUST pass it to
    validate_extraction_output() before using any field.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ExtractionClientError(
            "ANTHROPIC_API_KEY environment variable is not set. "
            "Configure it in Render environment variables."
        )

    model_id = get_model()
    client = anthropic.Anthropic(api_key=api_key)

    try:
        response = client.messages.create(
            model=model_id,
            max_tokens=MAX_TOKENS,
            temperature=0,  # deterministic extraction
            system=prompt.system_prompt,
            messages=[{"role": "user", "content": prompt.user_prompt}],
        )
    except anthropic.APIError as exc:
        raise ExtractionClientError(f"Claude API call failed: {exc}") from exc

    # Extract the text block from the response
    if not response.content or response.content[0].type != "text":
        raise ExtractionClientError(
            f"Unexpected response content type from Claude API. "
            f"stop_reason={response.stop_reason!r}, "
            f"content_types={[b.type for b in response.content]}"
        )

    raw_text: str = response.content[0].text.strip()

    if response.stop_reason == "max_tokens":
        logger.warning(
            "Claude hit max_tokens limit during extraction. "
            "The document may be too large for the current token budget (%d). "
            "Consider splitting at Layer 2.",
            MAX_TOKENS,
        )

    # Parse the JSON response — any failure here is an ExtractionOutputParseError,
    # not a Layer 4 schema validation failure.
    try:
        raw_output = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ExtractionOutputParseError(
            f"Claude returned non-JSON text: {exc}",
            raw_text=raw_text,
        ) from exc

    if not isinstance(raw_output, dict):
        raise ExtractionOutputParseError(
            f"Claude returned JSON but not a dict (got {type(raw_output).__name__}).",
            raw_text=raw_text,
        )

    logger.info(
        "Claude extraction call complete. model=%s stop_reason=%s "
        "input_tokens=%d output_tokens=%d",
        response.model,
        response.stop_reason,
        response.usage.input_tokens,
        response.usage.output_tokens,
    )

    return ClaudeCallResult(
        raw_output=raw_output,
        model_id=response.model,
        stop_reason=response.stop_reason,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )
