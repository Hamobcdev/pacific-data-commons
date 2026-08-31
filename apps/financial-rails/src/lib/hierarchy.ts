/**
 * Monetary Authority Hierarchy
 *
 * This hierarchy is absolute and enforced at every layer of the
 * SBP financial rails architecture. It is not a policy setting —
 * it is the documented legal and regulatory structure.
 *
 * CBS is the monetary authority under the Central Bank Act of Samoa.
 * Commercial banks operate under CBS licence.
 * Mobile money providers operate under commercial bank sponsorship.
 * SBP is the infrastructure operator — it has no custody authority
 * at any point in the payment chain (CLAUDE.md P2).
 *
 * BUILD GATE: Live CBS connectivity requires CBS written regulatory
 * position (H1 risk item) before any activation.
 *
 * Single source of truth for both routes/cbsOversight.ts and
 * routes/escrow.ts — CLAUDE.md P6 (publish-once correctness matters even
 * for stub-stage architecture documents like this one).
 */

export const MONETARY_AUTHORITY_HIERARCHY = {
  tier_1: {
    name: "Central Bank of Samoa",
    role: "monetary_authority_and_escrow_custodian",
    authority: [
      "USDC reserve custody",
      "WST/USDC conversion rate setting",
      "KYC/AML final review and override",
      "Commercial bank licence oversight",
      "WST-DPI stablecoin activation authority",
      "Ecosystem-wide transaction monitoring",
    ],
    cbs_write_access: ["exchange_rates", "reserve_ratios", "kyc_aml_decisions", "provider_activation_approval"],
    cbs_read_access: "all_ecosystem_nodes",
    sbp_has_authority: false,
  },
  tier_2: {
    name: "Licensed commercial banks",
    members: ["BSP", "ANZ Pacific", "Westpac Pacific"],
    role: "payment_infrastructure_under_cbs_licence",
    authority: ["Fiat currency on-ramp (under CBS approval)", "Customer KYC for their own clients", "Payment processing within their licence scope"],
    read_access: "own_transactions_and_shared_kyc_flags",
    cbs_oversight: true,
  },
  tier_3: {
    name: "Mobile money providers",
    members: ["M-PAiSA Samoa", "M-PAiSA Fiji"],
    role: "mobile_payment_under_bank_sponsorship",
    authority: ["WST/FJD mobile money on-ramp (under CBS/RBF approval)", "USDC float management (under sponsor bank oversight)"],
    read_access: "own_transactions",
    cbs_oversight: true,
  },
  tier_4: {
    name: "Synergy Blockchain Pacific",
    role: "infrastructure_operator_no_custody",
    authority: ["x402 payment routing", "PSR registry operation", "Trust tier verification", "Platform node operation"],
    custody_authority: false,
    admin_path_on_sovereign_records: false,
    note: "CLAUDE.md P2 — SBP never holds funds at any point",
  },
} as const;
