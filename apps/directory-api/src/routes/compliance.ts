import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { complianceAuth } from "../middleware/complianceAuth.js";
import { ValidationError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { AppBindings } from "../types.js";

/**
 * Session 38 — AML/KYC compliance stub + CBS Type 3 escrow architecture
 * stub (CLAUDE.md v2.2, Section 4 P4/P2, Session 38 build prompt
 * Deliverables 2 and 3).
 *
 * Every route here answers with `stub: true` and never implies a live
 * verification/screening decision — the real engine activates only when
 * CBS provides a written regulatory position (H1 risk item). Placed flatly
 * alongside every other directory-api route, same convention noted in
 * attribution.ts and internal.ts's doc comments.
 *
 * /compliance/kyc/verify, /compliance/aml/screen-transaction, and
 * /compliance/escrow/summary are gated by complianceAuth
 * (Authorization: Bearer <COMPLIANCE_API_KEY>). /compliance/status is
 * intentionally public — it publishes engine posture, not any entity's
 * verification data.
 */
export const complianceRoute = new Hono<AppBindings>();

complianceRoute.use("/compliance/kyc/verify", complianceAuth);
complianceRoute.use("/compliance/aml/screen-transaction", complianceAuth);
complianceRoute.use("/compliance/escrow/summary", complianceAuth);

const FATF_TRAVEL_RULE_THRESHOLD_USDC = 1000;

const kycVerifySchema = z.object({
  wallet_address: z.string().min(1, "wallet_address is required"),
  entity_name: z.string().min(1, "entity_name is required"),
  entity_type: z.enum(["provider", "buyer", "merchant", "creator", "grant_sponsor"]),
  country_code: z.string().min(1, "country_code is required"),
  contact_email: z.string().email("contact_email must be a valid email"),
  platform_node: z.string().min(1, "platform_node is required"),
});

/**
 * POST /compliance/kyc/verify — stub identity verification. Writes an
 * audit-trail row to compliance_checks on every call (CLAUDE.md P7 —
 * nothing that touches money or trust is opaque) but never performs a real
 * PEP/sanctions check yet.
 */
complianceRoute.post("/compliance/kyc/verify", async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = kycVerifySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(`Invalid KYC verification request — ${parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ")}`);
  }
  const input = parsed.data;

  const verificationId = `kyc-${randomUUID()}`;
  const createdAt = new Date().toISOString();

  const supabase = c.get("supabase");
  const { error } = await supabase.from("compliance_checks").insert({
    check_type: "kyc",
    entity_type: input.entity_type,
    wallet_address: input.wallet_address,
    platform_node: input.platform_node,
    status: "pending",
    risk_level: "standard",
    fatf_applicable: false,
    pep_check: "stub_clear",
    sanctions_check: "stub_clear",
    screening_reference: verificationId,
    notes: `entity_name=${input.entity_name}; country_code=${input.country_code}; contact_email=${input.contact_email}`,
  });

  if (error) {
    logger.error("compliance_kyc_insert_failed", { message: error.message });
  }

  return c.json(
    {
      verification_id: verificationId,
      status: "pending_review",
      risk_level: "standard",
      fatf_jurisdiction: input.country_code,
      pep_check: "stub_clear",
      sanctions_check: "stub_clear",
      estimated_completion_hours: 24,
      stub: true,
      stub_reason: "Live KYC/AML engine activates when CBS regulatory position confirmed (H1 risk item).",
      fatf_alignment: "R.15",
      created_at: createdAt,
    },
    200,
  );
});

const amlScreenSchema = z.object({
  tx_id: z.string().min(1, "tx_id is required"),
  wallet_from: z.string().min(1, "wallet_from is required"),
  wallet_to: z.string().min(1, "wallet_to is required"),
  amount_usdc: z.number().nonnegative("amount_usdc must be a non-negative number"),
  platform_node: z.string().min(1, "platform_node is required"),
  transaction_type: z.enum([
    "data_query",
    "content_view",
    "course_completion",
    "commerce_purchase",
    "deployment_fee",
    "tip",
    "grant_disbursement",
    "payroll",
    "reserve_conversion",
  ]),
});

/**
 * POST /compliance/aml/screen-transaction — stub AML screening. Writes an
 * audit-trail row to compliance_checks on every call. fatf_travel_rule_applicable
 * flags amounts at or above FATF_TRAVEL_RULE_THRESHOLD_USDC for future real
 * enforcement — no transaction is ever blocked by this stub.
 */
complianceRoute.post("/compliance/aml/screen-transaction", async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = amlScreenSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(`Invalid AML screening request — ${parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ")}`);
  }
  const input = parsed.data;

  const screeningId = `aml-${randomUUID()}`;
  const screenedAt = new Date().toISOString();
  const travelRuleApplicable = input.amount_usdc >= FATF_TRAVEL_RULE_THRESHOLD_USDC;

  const supabase = c.get("supabase");
  const { error } = await supabase.from("compliance_checks").insert({
    check_type: "aml_transaction",
    entity_type: "transaction",
    wallet_address: input.wallet_from,
    wallet_to: input.wallet_to,
    platform_node: input.platform_node,
    transaction_type: input.transaction_type,
    amount_usdc: input.amount_usdc,
    status: "stub",
    risk_level: "standard",
    risk_score: 0,
    flags: [],
    fatf_applicable: travelRuleApplicable,
    screening_reference: screeningId,
    notes: `tx_id=${input.tx_id}`,
  });

  if (error) {
    logger.error("compliance_aml_insert_failed", { message: error.message });
  }

  return c.json(
    {
      screening_id: screeningId,
      status: "stub_cleared",
      risk_score: 0,
      flags: [],
      fatf_travel_rule_applicable: travelRuleApplicable,
      travel_rule_threshold_usdc: FATF_TRAVEL_RULE_THRESHOLD_USDC,
      stub: true,
      stub_reason: "AML screening stub. FATF R.15 monitoring activates at CBS-confirmed threshold.",
      screened_at: screenedAt,
    },
    200,
  );
});

/**
 * GET /compliance/status — public engine posture. No auth: this is
 * infrastructure status, not any entity's verification/screening data.
 */
complianceRoute.get("/compliance/status", (c) => {
  return c.json({
    engine: "sbp-compliance-v1",
    engine_mode: "stub",
    stub: true,
    live: false,
    activation_gate: "CBS regulatory position (H1) — written position required before live engine activates",
    standards: {
      fatf: "R.15 / R.16 — architecture aligned, stub active",
      cisa_ztmm: "2.0 — RLS enforcement active on all tables",
      iia_ippf: "2024 — audit read-only portal available",
      imo_fal: "2024 — OMW compliant",
    },
    cbs_oversight: {
      read_access_nodes: ["pdc-mainnet", "omw-pilot", "dbs-lms", "payshield", "pacific-content-rail", "pacific-education-commons", "pacific-commerce-node"],
      monetary_authority: "Central Bank of Samoa",
      escrow_custodian: "CBS (when activated — stub)",
      status: "stub",
    },
    features_when_live: [
      "wallet_identity_scoring",
      "real_time_transaction_monitoring",
      "pep_and_sanctions_screening",
      "suspicious_activity_detection",
      "fatf_travel_rule_enforcement",
      "algorand_mainnet_immutable_audit_trail",
      "cbs_reserve_monitoring",
      "cross_node_wallet_risk_aggregation",
    ],
  });
});

/**
 * GET /compliance/escrow/summary — CBS Type 3 escrow architecture stub
 * (Deliverable 3C). Summarises payment_providers and reserve_positions.
 * Both tables are service-role-only (no provider/buyer/public RLS policy
 * under any circumstance) — this route is the only read surface for them
 * until Session 39's dedicated CBS read-only role exists.
 */
complianceRoute.get("/compliance/escrow/summary", async (c) => {
  const supabase = c.get("supabase");

  const { data: providers, error: providersError } = await supabase.from("payment_providers").select("status");
  if (providersError) {
    logger.error("compliance_escrow_providers_query_failed", { message: providersError.message });
  }
  const providerRows = (providers ?? []) as Array<{ status: string }>;
  const activeProviders = providerRows.filter((p) => p.status === "active").length;
  const stubProviders = providerRows.filter((p) => p.status === "stub").length;

  const { data: positions, error: positionsError } = await supabase.from("reserve_positions").select("position_type,amount_usdc_equivalent,status");
  if (positionsError) {
    logger.error("compliance_escrow_positions_query_failed", { message: positionsError.message });
  }
  const positionRows = (positions ?? []) as Array<{ position_type: string; amount_usdc_equivalent: number | null; status: string }>;
  const sumByType = (positionType: string) =>
    positionRows.filter((p) => p.position_type === positionType && p.status === "stub").reduce((total, p) => total + (p.amount_usdc_equivalent ?? 0), 0);

  return c.json({
    escrow_summary: {
      custodian: "Central Bank of Samoa",
      custodian_status: "stub",
      total_providers: providerRows.length,
      active_providers: activeProviders,
      stub_providers: stubProviders,
      usdc_in_custody_stub: sumByType("usdc_custodial"),
      fiat_reserves_stub: sumByType("fiat_reserve"),
      donor_grants_stub: sumByType("donor_grant_wallet"),
      stub: true,
      activation_note: "CBS Type 3 escrow activates when H1 regulatory position confirmed and CBS multisig wallet established",
    },
    cbs_oversight_nodes: ["pdc-mainnet", "omw-pilot", "dbs-lms", "payshield", "pacific-content-rail", "pacific-education-commons", "pacific-commerce-node"],
    monetary_authority_hierarchy: {
      tier_1: "Central Bank of Samoa — monetary authority, escrow custodian, KYC/AML final arbiter",
      tier_2: "Licensed commercial banks (BSP, ANZ Pacific, Westpac Pacific) — operate under CBS licence",
      tier_3: "Mobile money providers (M-PAiSA) — operate under tier 2 bank sponsorship",
      tier_4: "SBP — infrastructure operator and payment router, no custody authority",
    },
  });
});
