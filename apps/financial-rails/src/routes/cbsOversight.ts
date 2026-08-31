import { Hono } from "hono";
import { MONETARY_AUTHORITY_HIERARCHY } from "../lib/hierarchy.js";
import { PLATFORM_NODES } from "../lib/platformNodes.js";
import { logger } from "../lib/logger.js";
import type { AppBindings } from "../types.js";

export const cbsOversightRoute = new Hono<AppBindings>();

interface ComplianceCountRow {
  status: string;
  cbs_reviewed: boolean;
}

/**
 * GET /cbs-oversight/ecosystem — the single "what does the ecosystem look
 * like" view for CBS, sourced from three places: the PSR platform node
 * registry (platformNodes.ts), the monetary authority hierarchy
 * (hierarchy.ts), and a live count over compliance_checks. Nothing here is
 * a hand-maintained literal duplicate of those two source-of-truth files —
 * CLAUDE.md P6 (publish-once correctness) applies to stub-stage
 * architecture documents too, not just published certificates.
 */
cbsOversightRoute.get("/cbs-oversight/ecosystem", async (c) => {
  const supabase = c.get("supabase");

  const { data, error } = await supabase.from("compliance_checks").select("status,cbs_reviewed");
  if (error) {
    logger.error("cbs_oversight_compliance_query_failed", { message: error.message });
  }
  const rows = (data ?? []) as ComplianceCountRow[];

  return c.json({
    monetary_authority: "Central Bank of Samoa",
    oversight_nodes: PLATFORM_NODES.filter((n) => n.cbs_read_access),
    hierarchy: {
      tier_1_central_bank: "CBS — monetary authority, escrow custodian, KYC/AML final arbiter",
      tier_2_commercial_banks: MONETARY_AUTHORITY_HIERARCHY.tier_2.members,
      tier_3_mobile_money: MONETARY_AUTHORITY_HIERARCHY.tier_3.members,
      tier_4_infrastructure: "SBP — routing and infrastructure, no custody",
    },
    compliance_summary: {
      total_checks: rows.length,
      flagged_pending_cbs_review: rows.filter((r) => r.status === "flagged" && !r.cbs_reviewed).length,
      cleared: rows.filter((r) => r.status === "cleared").length,
      stub: true,
    },
    escrow_status: {
      custodian: "CBS",
      status: "stub",
      activation_gate: "H1 — CBS written regulatory position",
    },
  });
});

/**
 * GET /cbs-oversight/compliance-flags — the raw compliance_checks rows
 * behind compliance_summary.flagged_pending_cbs_review above. Not in the
 * Session 39 brief's enumerated route list, but the dashboard's Section 5
 * ("Table of compliance_checks where status = 'flagged'") has nothing else
 * to read from — the ecosystem summary route only returns a count. Added
 * here rather than a new file since this is CBS-oversight reading, same
 * table and same posture as /cbs-oversight/ecosystem above. Read-only, no
 * write path — matches the Session 39 preamble's "CBS read access is
 * read-only on all ecosystem data."
 */
cbsOversightRoute.get("/cbs-oversight/compliance-flags", async (c) => {
  const supabase = c.get("supabase");

  const { data, error } = await supabase
    .from("compliance_checks")
    .select("id,check_type,entity_type,wallet_address,platform_node,transaction_type,amount_usdc,risk_level,risk_score,flags,checked_at,cbs_reviewed,notes")
    .eq("status", "flagged")
    .order("checked_at", { ascending: false });
  if (error) {
    logger.error("cbs_oversight_flags_query_failed", { message: error.message });
  }

  return c.json({ flags: data ?? [], total: (data ?? []).length, stub: true });
});
