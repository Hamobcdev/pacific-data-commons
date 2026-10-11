"""
PDQE Stage 04 — Jev Question Definitions.

Versioned. Pin version in every assessment record. Do NOT ask "Is this
dataset good?" — ask observable, verifiable properties only. Jev returns
typed primitives (probability, score, choice); it never makes a holistic
quality judgment.
"""

from __future__ import annotations

from dataclasses import dataclass

CURRENT_QUESTION_SET_VERSION = "v1.0"

DOMAIN_CHOICES = [
    "FISHERIES",
    "CLIMATE",
    "TRADE",
    "AGRICULTURE",
    "OCEAN",
    "ENVIRONMENT",
    "ECONOMICS",
    "GOVERNANCE",
    "HEALTH",
    "OTHER",
    "NONE_OF_THE_ABOVE",
]

SCORE_MAX = 4  # 0=insufficient, 1=minimal, 2=partial, 3=substantial, 4=complete


@dataclass(frozen=True)
class NoulQuestion:
    id: str
    text: str


@dataclass(frozen=True)
class ScoreQuestion:
    id: str
    text: str
    max_score: int


@dataclass(frozen=True)
class ChoiceQuestion:
    id: str
    text: str
    choices: list[str]


NOUL_QUESTIONS: list[NoulQuestion] = [
    NoulQuestion(
        "source_identifiable",
        "Is the data source URL, document title, or dataset identifier clearly present "
        "and unambiguous in the provided content?",
    ),
    NoulQuestion(
        "publisher_identifiable",
        "Is the publishing organisation, agency, or author clearly identified by name "
        "in the provided content?",
    ),
    NoulQuestion(
        "methodology_present",
        "Does the content describe or reference a data collection methodology, sampling "
        "approach, or measurement standard?",
    ),
    NoulQuestion(
        "licence_statement_present",
        "Is there a clear licence statement, terms of use, copyright notice, or data sharing "
        "agreement present or explicitly referenced in the content?",
    ),
    NoulQuestion(
        "geography_identifiable",
        "Is the geographic scope of this data clearly identifiable — at minimum a country, "
        "region, ocean zone, or coordinates?",
    ),
    NoulQuestion(
        "time_period_identifiable",
        "Is the time period or temporal coverage of this data clearly stated — at minimum "
        "a year or date range?",
    ),
    NoulQuestion(
        "machine_readable",
        "Is the data available in or accompanied by a structured machine-readable format "
        "(CSV, JSON, XML, API endpoint, or similar)?",
    ),
    NoulQuestion(
        "value_plausible",
        "Are the data values, statistics, or indicators present in this content plausible and "
        "internally consistent with the stated subject, geography, and time period?",
    ),
]

SCORE_QUESTIONS: list[ScoreQuestion] = [
    ScoreQuestion(
        "metadata_completeness",
        "Rate the metadata completeness of this source on a scale of 0-4, where "
        "0=no metadata, 1=minimal (title only), 2=partial (title+publisher+date), "
        "3=substantial (adds methodology or geography), 4=complete (all fields present).",
        SCORE_MAX,
    ),
    ScoreQuestion(
        "provenance_completeness",
        "Rate the provenance of this source on a scale of 0-4, where "
        "0=no provenance, 1=minimal (URL only), 2=partial (URL+publisher), "
        "3=substantial (adds original data source), 4=complete (full chain traceable).",
        SCORE_MAX,
    ),
    ScoreQuestion(
        "documentation_readiness",
        "Rate how ready this source's documentation is for publishing as a PDC data endpoint, "
        "0=insufficient, 1=minimal (bare URL), 2=partial (URL+title+domain), "
        "3=substantial (adds methodology reference), 4=complete (all fields for an endpoint description).",
        SCORE_MAX,
    ),
    ScoreQuestion(
        "endpoint_readiness",
        "Rate the technical readiness of this data for an automated API endpoint, "
        "0=not machine-readable, 1=PDF only, 2=structured document, "
        "3=structured with extractable numeric values, 4=direct API or structured data feed.",
        SCORE_MAX,
    ),
]

CHOICE_QUESTION = ChoiceQuestion(
    "domain_classification",
    "Based on the content of this dataset, which single primary domain does it belong to? "
    "Consider the main subject matter, not the publisher.",
    DOMAIN_CHOICES,
)
