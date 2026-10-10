"""
PDQE Stage 02 — Layer 2: Content sanitisation (interface only).

Strips executable code, macros, embedded scripts, and all metadata before
any content reaches Layer 3. Files are treated as untrusted data (Decision 58).

Full implementation is Stage 02b. This stage defines the interface and
return shape only — calling run_layer2() raises NotImplementedError so a
caller can never mistake an unimplemented sanitisation pass for a passed one.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Layer2Result:
    passed: bool
    content_hash: str | None
    sanitised_content: bytes | None
    rejection_reason: str | None = None


def run_layer2(raw_content: bytes, file_extension: str) -> Layer2Result:
    """
    Sanitise raw upload bytes: strip macros, embedded scripts, executable
    code, and metadata; compute the canonical content hash.

    Not implemented in Stage 02 — see PDQE Stage 02b. Raising here (rather
    than returning a stub "passed" result) prevents an unfinished layer from
    silently waving content through to Layer 3.
    """
    raise NotImplementedError(
        "Layer 2 sanitisation is not implemented until Stage 02b. "
        "No file may reach Layer 3 without a real sanitisation pass."
    )
