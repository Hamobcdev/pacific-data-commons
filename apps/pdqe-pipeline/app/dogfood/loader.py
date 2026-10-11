"""
PDQE Stage 10 — corpus loader.

Loads seed source definitions from corpus/<name>.json and validates every
entry against SeedSource (P9). A malformed corpus file fails the whole load —
a corpus is checked-in configuration, so a bad entry is a bug to fix, not a
source to skip.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import ValidationError

from app.dogfood.schemas import (
    CORPUS_PRIMARY_DOMAIN,
    Corpus,
    SeedSource,
    resolve_corpus,
)

CORPUS_DIR = Path(__file__).parent.parent.parent / "corpus"

DOMAIN_FILE_MAP = {
    "FISHERIES": "fisheries.json",
    "CLIMATE": "climate.json",
    "TRADE": "trade.json",
    "ECONOMICS": "trade.json",  # alias
    "TOURISM": "tourism.json",
    "HEALTH": "health.json",
}

# Seed files are small hand-written metadata; anything larger is not a corpus.
MAX_CORPUS_BYTES = 256 * 1024


def load_corpus(domain: str, corpus_dir: Path | None = None) -> list[SeedSource]:
    """
    Load and P9-validate the seed sources for a domain.

    Raises ValueError for an unknown domain, a missing/oversized/non-JSON
    file, an invalid seed, a seed whose domain doesn't match the corpus, or a
    duplicate source_url.
    """
    corpus: Corpus = resolve_corpus(domain)
    path = (corpus_dir or CORPUS_DIR) / DOMAIN_FILE_MAP[corpus.value]

    try:
        raw_bytes = path.read_bytes()
    except OSError as exc:
        raise ValueError(f"corpus file {path.name} could not be read: {exc}") from exc
    if len(raw_bytes) > MAX_CORPUS_BYTES:
        raise ValueError(f"corpus file {path.name} exceeds {MAX_CORPUS_BYTES} bytes")
    try:
        raw = json.loads(raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"corpus file {path.name} is not valid UTF-8 JSON: {exc}") from exc
    if not isinstance(raw, list):
        raise ValueError(f"corpus file {path.name} must contain a JSON array")

    expected_domain = CORPUS_PRIMARY_DOMAIN[corpus]
    seeds: list[SeedSource] = []
    seen_urls: set[str] = set()
    for index, entry in enumerate(raw):
        try:
            seed = SeedSource.model_validate(entry)
        except ValidationError as exc:
            raise ValueError(f"{path.name}[{index}] is not a valid seed source: {exc}") from exc
        if seed.domain != expected_domain:
            raise ValueError(
                f"{path.name}[{index}] has domain {seed.domain.value}; "
                f"the {corpus.value} corpus requires {expected_domain.value}"
            )
        if seed.source_url in seen_urls:
            raise ValueError(f"{path.name}[{index}] duplicates source_url {seed.source_url}")
        seen_urls.add(seed.source_url)
        seeds.append(seed)
    return seeds
