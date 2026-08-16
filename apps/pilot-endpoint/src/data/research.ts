/**
 * Session 21 (Decision 42, PDC-POL-2026-001) — structured queryable
 * metadata for two SBP working papers. The underlying documents remain
 * openly accessible on request; PDC hosts the structured queryable layer
 * only, priced at Tier 1 (summary) maximum. Content below (abstract,
 * policy_gaps_identified, governance_frameworks_referenced,
 * incidents_analysed, mandate_components, citation) is drawn directly from
 * the working papers' own stated content — not fabricated or embellished.
 */

export const LAW_BEFORE_CODE = {
  title: "Law Before Code: SBP-WP-2026-001",
  version: "v1.4",
  published: "2026-07-01",
  status: "Under NUS/ISOC review",
  abstract:
    "Working paper on the governance sequencing framework required before blockchain activation in Pacific SIDS. Covers BIS PFMI, FATF R.15, CISA ZTMM 2.0 compliance architecture.",
  policy_gaps_identified: [
    "Regulatory certainty pathway from sandbox to full licence",
    "WST-DPI digital asset regulatory framework",
    "Government ministry receipt of digital asset revenue",
    "Professional development gap for ICT administrators",
    "USDC off-ramp infrastructure for Pacific institutions",
  ],
  governance_frameworks_referenced: ["BIS PFMI Principle 1", "FATF Recommendation 15", "CISA ZTMM 2.0", "IIA IPPF 2024"],
  access_full_document: "Contact anthony@synergybcpacific.com",
  citation: "Williams, A.G. (2026). Law Before Code. SBP-WP-2026-001. Synergy Blockchain Pacific.",
} as const;

export const CRYPTOGRAPHIC_CONTINUITY = {
  title: "Cryptographic Continuity: SBP-WP-2026-002",
  version: "v1.2",
  published: "2026-08-09",
  status: "First publication",
  companion_paper: "SBP-WP-2026-001",
  abstract:
    "Working paper proposing a Cryptographic Continuity Mandate for Pacific SIDS digital infrastructure. Addresses post-quantum cryptography, AI-assisted cryptanalysis, hardware security, and harvest-now-decrypt-later threats in Pacific government context.",
  incidents_analysed: ["HAWK-256 post-quantum algorithm broken by AI (July 2026)", "Coldcard hardware wallet firmware exploit — $100M+ drained (July 2026)"],
  mandate_components: ["Standards tracking (NIST, IETF, ISO)", "Infrastructure assessment on defined cycle", "Emergency response protocol", "Workforce development pipeline"],
  access_full_document: "Contact anthony@synergybcpacific.com",
  citation: "Williams, A.G. (2026). Cryptographic Continuity. SBP-WP-2026-002. Synergy Blockchain Pacific.",
} as const;
