"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getServerMessage } from "@/lib/i18n/server-messages";

export interface CreateDeploymentResult {
  success: boolean;
  error?: string;
  deploymentId?: string;
  estimatedReview?: string;
}

/**
 * Step 6 — SBP-managed path. Does NOT call Railway (that's a manual SBP
 * action during POC, per CLAUDE.md Section 20 / the Session 6 spec) —
 * this just records the request and raises an internal alert for SBP's
 * review queue. `deployment_type` uses the real endpoint_deployments enum
 * (session1_migration.sql — 'railway_sbp_managed' | 'railway_provider' |
 * 'render_provider' | 'self_hosted'), not the 'sbp_managed'/'self_hosted'
 * values drafted in the Session 6 prompt, which don't match the live
 * schema (see session6_endpoint_deployments.sql for why that table wasn't
 * redefined).
 */
export async function createDeployment(providerId: string): Promise<CreateDeploymentResult> {
  const supabase = createServiceClient();

  const { data: endpoint, error: endpointError } = await supabase
    .from("endpoints")
    .select("id")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (endpointError || !endpoint) {
    console.error("Create deployment — endpoint lookup failed:", endpointError);
    return { success: false, error: getServerMessage("actions.createDeployment.noEndpointFound") };
  }

  const { data: deployment, error: deploymentError } = await supabase
    .from("endpoint_deployments")
    .insert({
      provider_id: providerId,
      endpoint_id: endpoint.id,
      deployment_type: "railway_sbp_managed",
      status: "pending",
    })
    .select("id")
    .single();

  if (deploymentError || !deployment) {
    console.error("Create deployment — insert failed:", deploymentError);
    return { success: false, error: getServerMessage("actions.createDeployment.genericError") };
  }

  const { error: alertError } = await supabase.from("platform_alerts").insert({
    alert_type: "deployment_requested",
    severity: "medium",
    entity_type: "endpoint",
    entity_id: endpoint.id,
    message: `SBP-managed deployment requested — provider ${providerId}, endpoint ${endpoint.id}, deployment ${deployment.id}`,
  });

  if (alertError) {
    // Non-fatal for the provider's flow — the deployment request itself is
    // already recorded; SBP's alert feed just won't surface it until this
    // is investigated.
    console.error("Create deployment — platform_alerts insert failed:", alertError);
  }

  return { success: true, deploymentId: deployment.id as string, estimatedReview: "2 business days" };
}
