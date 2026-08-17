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

/**
 * Session 23 (Decision 42) — section-level content for the `tier` query
 * param on the research routes below. `summary` (default, unchanged) is the
 * const above; `slice` returns one named section (or all, if none named);
 * `full` returns the summary plus every section. All three tiers are priced
 * identically at TIER_PRICING.summary in index.ts's paidRoutes — Decision 42
 * caps governance/research endpoints at Tier 1 regardless of content depth,
 * because the underlying document is already openly accessible on request;
 * deeper content here is convenience, not a paywall tier.
 */
export const LAW_BEFORE_CODE_SECTIONS = {
  introduction: {
    title: "1. Introduction — The Sequencing Problem",
    content:
      "Digital public infrastructure built on blockchain technology presents Pacific SIDS with a fundamental sequencing problem. The technology is available. The use cases are documented. The international standards frameworks that Pacific governments are committed to implementing increasingly depend on distributed ledger architecture. Yet the governance frameworks, legislative authorities, and institutional capacities that would make blockchain-based DPI safe to activate are absent or incomplete in most Pacific jurisdictions. This paper argues that the sequencing error — activating technology before establishing governance — is the primary risk in Pacific DPI deployment.",
  },
  production_gates: {
    title: "2. The Three Production Gates",
    content:
      "Before the blockchain governance layer of any Pacific DPI system should be activated, three production gates must be satisfied: Gate 1 — A formal government agreement or equivalent external funding must be secured. Gate 2 — Capital must be secured for sovereign node infrastructure within national jurisdiction. Gate 3 — A national governance framework must be enacted, providing legislative authority for keyholder obligations and oversight. These gates are sequential. Activating the blockchain layer before all three are satisfied creates governance risk that immutability makes extremely difficult to reverse.",
  },
  three_ring_architecture: {
    title: "3. The Three-Ring Sovereign Stack",
    content:
      "Ring 0 — core regulatory and financial authority — contains CBDC/stablecoin systems and central bank oversight. Ring 1 — ministry applications — contains individual ministry systems across agriculture, fisheries, health, education, finance, and customs. Ring 2 — citizen and enterprise layer — contains citizen portals, the data marketplace, and international interoperability interfaces. Each ring has defined governance authorities, data sovereignty protections, and activation requirements.",
  },
  legislative_gaps: {
    title: "4. Five Legislative Gaps",
    content:
      "Gap 1: No regulatory certainty pathway from sandbox to full DLT licence. Gap 2: No framework for a nationally issued stablecoin or CBDC. Gap 3: No policy framework for government ministry receipt of digital asset revenue. Gap 4: Professional development gap for ICT administrators. Gap 5: No regulated digital asset to fiat conversion pathway for Pacific institutions.",
  },
  recommendations: {
    title: "5. Recommendations",
    content:
      "Five specific recommendations scoped to existing institutional authorities: (1) CBS publish Sandbox Participant Guidance with indicative licensing pathway; (2) Ministry of Finance publish Digital Asset Revenue Policy; (3) MCIT commission Pacific DLT Standards Literacy Programme; (4) Forum Secretariat produce Pacific Digital Infrastructure Standards Literacy Guide; (5) CBS commission Digital Asset Conversion Feasibility Study.",
  },
} as const;

export const CRYPTOGRAPHIC_CONTINUITY_SECTIONS = {
  acceleration_problem: {
    title: "1. The Acceleration Problem — Two July 2026 Incidents",
    content:
      "The HAWK-256 finding demonstrated that AI-assisted cryptanalysis can break post-quantum cryptographic candidates in approximately 60 hours at a cost of roughly $100,000 — within reach of well-resourced private actors. The Coldcard firmware exploit demonstrated that security failures arrive at layers the primary posture does not address: five years elapsed before a weak entropy source was exploited. The harvest-now-decrypt-later threat compounds both: data encrypted today may already be stored by adversaries awaiting quantum capability.",
  },
  local_infrastructure: {
    title: "2. Why Local Infrastructure Is the Security Answer",
    content:
      "Vendor-dependent infrastructure updates on the vendor's timeline and commercial constraints. A Pacific government has no standing to require a faster response. Locally built infrastructure changes this: the response timeline is determined by national priorities. The talent drain compounds the risk — the people who understand the technology are disproportionately absorbed into donor agencies. Building local capacity is a security requirement, not a development aspiration.",
  },
  mandate_components: {
    title: "3. The Cryptographic Continuity Mandate",
    content:
      "Four components: (1) Standards tracking — monitor NIST, IETF, ISO on annual cycle minimum. (2) Infrastructure assessment — assess cryptographic layer including entropy sources, key management, and supply chain dependencies. Minimum: two to three weeks annual review by qualified academic researcher against NIST post-quantum checklist, report submitted to defined oversight body. (3) Emergency response protocol — defined notification sequence and authority to activate. (4) Workforce development pipeline — training and employment creating demand for local capacity.",
  },
  recommendations: {
    title: "4. Recommendations",
    content:
      "For the Government of Samoa: include the Mandate as a required DPI governance framework component; direct CBS sandbox to include security maintenance obligations. For NUS/ISOC Research Programme: produce annual Pacific Cryptographic Standards Register. For Pacific Islands Forum: adopt the Mandate as a shared governance principle; establish Pacific Digital Security Network.",
  },
} as const;

export const INVISIBLE_INFRASTRUCTURE = {
  title: "The Invisible Infrastructure: SBP-WP-2026-003",
  version: "v1.2",
  published: "2026-08-18",
  status: "First publication",
  companion_papers: ["SBP-WP-2026-001", "SBP-WP-2026-002"],
  abstract:
    "Pacific Island governments face a paradox. Many have formally adopted positions of caution toward blockchain technology — understandably, given fraudulent schemes that affected Pacific communities from as early as 2014. Simultaneously, those same governments are being asked by the IMF, BIS, FATF, and IMO to implement digital infrastructure standards built, at the technical layer, on distributed ledger technology. This paper documents that paradox from the perspective of a practitioner building blockchain-based government digital infrastructure in Samoa.",
  fraudulent_schemes_documented: [
    "OneCoin (2014–2017) — approximately $4 billion from 3.5 million victims globally. No actual blockchain. Founder disappeared 2017.",
    "SwissCoin → PlatinCoin → PLC Ultima — three iterations. PLCU reached ATH approximately $113,000 in April 2022 before collapse. Pacific communities affected across all three iterations.",
  ],
  standards_built_on_dlt: [
    "BIS Innovation Hub: Project mBridge, Project Dunbar, Project Jura — all distributed ledger",
    "FATF Travel Rule — blockchain-based attestation compliance infrastructure",
    "IMO FAL Single Window — requires cryptographic integrity, immutable audit trails, distributed agency control",
    "SWIFT cross-border trials using Chainlink CCIP — blockchain-based interoperability",
  ],
  key_arguments: [
    "The crypto/blockchain conflation began with fraudulent schemes before 2020 — Pacific communities were directly affected",
    "Global financial standards are built on DLT without using the term blockchain in ministerial communications",
    "Pacific SIDS have a structural advantage in digital transformation — size enables economy-wide implementation at speeds large nations cannot match",
    "The CBS sandbox is well-administered but scoped to fintech — whole-of-government DPI applications sit in regulatory ambiguity",
  ],
  policy_gaps_identified: [
    "Regulatory literacy gap — no Pacific-contextualised plain-language DLT standards guide",
    "Sandbox scope gap — CBS sandbox scoped to fintech, not whole-of-government DPI",
    "Government revenue gap — no published guidance on ministry receipt of digital asset revenue",
    "Professional development gap — no credentialed Pacific DLT curriculum for government officers",
    "Last-mile revenue gap — no regulated digital asset to fiat conversion pathway",
  ],
  recommendations: [
    "Forum Secretariat: commission Pacific Digital Infrastructure Standards Literacy Guide",
    "CBS and/or MCIT: expand sandbox or create complementary DPI sandbox instrument",
    "Ministry of Finance: publish Digital Asset Revenue Policy",
    "SPC: develop Pacific Digital Infrastructure Professional Development Programme",
    "CBS: commission Digital Asset Conversion Feasibility Study",
  ],
  access_full_document: "Contact anthony@synergybcpacific.com",
  citation: "Williams, A.G. (2026). The Invisible Infrastructure. SBP-WP-2026-003. Synergy Blockchain Pacific.",
} as const;

export const INVISIBLE_INFRASTRUCTURE_SECTIONS = {
  conflation_problem: {
    title: "2. The Conflation Problem — How Fraud Captured Blockchain's Reputation",
    content:
      "The conflation did not begin in 2020. OneCoin launched in 2014, had no actual blockchain, and accumulated approximately $4 billion from 3.5 million victims before its founder disappeared in 2017. Alex Reinhardt subsequently launched three iterations — SwissCoin, PlatinCoin, PLC Ultima — the last reaching approximately $113,000 in April 2022 during the global NFT and cryptocurrency peak before collapse. Pacific communities who had participated across earlier iterations lost money again. The CBS's regulatory caution was rational. The difficulty is that this caution was later applied to real blockchain applications bearing no resemblance to the fraud that caused the harm.",
  },
  global_standards: {
    title: "3. What Global Standards Are Actually Built On",
    content:
      "BIS Project mBridge connects four central banks through a common distributed ledger. Project Dunbar demonstrated atomic cross-border settlement using DLT. FATF Travel Rule compliance infrastructure is built on blockchain-based attestation systems. IMO FAL Single Window requires cryptographic integrity, immutable audit trails, and distributed agency control — the defining characteristics of distributed ledger. SWIFT conducted trials using Chainlink's Cross-Chain Interoperability Protocol. None of these are described as blockchain in ministerial briefings. A Pacific official at an IMF workshop will not hear the word blockchain — yet the systems described depend on exactly that technology.",
  },
  pacific_advantage: {
    title: "4. The Pacific Structural Advantage — Why Small Is Fast",
    content:
      "Every government ministry in Samoa can be connected to a shared interoperability platform in a timeframe that would take a large nation a decade. The compounding net effect — every component reinforcing every other — makes the opportunity genuinely significant. PNG is a distinct non-SIDS case. The African experience — including the Nigerian CBDC community revolt — illustrates the post-colonial dynamic where externally designed frameworks may not serve the communities they are nominally built for. The talent drain means the people who understand the technology are disproportionately in donor agencies, not local institutions. Locally funded infrastructure creates the demand for local capacity that keeps it in the country.",
  },
  policy_gaps: {
    title: "5. The Policy Gaps — Evidence from Implementation",
    content:
      "Gap 1 (Literacy): No Pacific-contextualised plain-language guide to DLT standards exists. Gap 2 (Sandbox scope): The CBS sandbox is well-administered within its fintech scope. The gap is that whole-of-government DPI sits in regulatory ambiguity — the author engages with CBS and intends to submit formal applications; a complementary DPI instrument would clarify this. Gap 3 (Revenue): The Pacific Data Commons has confirmed Mainnet transactions as of August 2026. No guidance exists on whether a Samoan government ministry can receive digital asset revenue. Gap 4 (Professional development): No credentialed Pacific DLT curriculum exists. Gap 5 (Last-mile): No regulated digital asset conversion pathway exists in Samoa at institutional grade.",
  },
  conclusions: {
    title: "6. Conclusions and Recommendations",
    content:
      "Pacific SIDS are not behind in digital transformation because of limited capacity or limited ambition. They are behind because of a specific, addressable information failure — the gap between what international standards bodies are building and what Pacific government officials understand themselves to be implementing. Closing that gap requires: a Pacific Digital Infrastructure Standards Literacy Guide; explicit sandbox scope for DPI applications; a Ministry of Finance Digital Asset Revenue Policy; a SPC Professional Development Programme; a CBS Digital Asset Conversion Feasibility Study. These are not ambitious asks. They are the minimum governance infrastructure required to allow Pacific SIDS to participate in the digital transformation they are already mandated to implement.",
  },
} as const;

export type ResearchSections = typeof LAW_BEFORE_CODE_SECTIONS | typeof CRYPTOGRAPHIC_CONTINUITY_SECTIONS | typeof INVISIBLE_INFRASTRUCTURE_SECTIONS;
export type SectionKey<S extends ResearchSections> = keyof S;
