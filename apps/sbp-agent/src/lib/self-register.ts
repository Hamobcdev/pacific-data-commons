import type { Logger } from "../logger.js";

/**
 * Provisions (or looks up) this agent's `agents` row via directory-api's
 * POST /internal/agents/self-register (Session 19) — see
 * apps/directory-api/src/services/agentSelfRegisterService.ts for the
 * server-side reasoning. Called once at startup, only when both the
 * wallet key and INTERNAL_API_KEY resolved (dry-run / unconfigured
 * deployments simply never submit attribution — degrade, don't crash,
 * same posture as the rest of this app's startup sequence).
 */
export async function ensureAgentRegistered(params: {
  directoryUrl: string;
  internalApiKey: string;
  operationalWalletAddress: string;
  logger: Logger;
}): Promise<string | undefined> {
  try {
    const res = await fetch(`${params.directoryUrl.replace(/\/$/, "")}/internal/agents/self-register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-api-key": params.internalApiKey,
      },
      body: JSON.stringify({
        agent_name: "SBP Pilot Agent",
        agent_type: "fisheries_status",
        operational_wallet: params.operationalWalletAddress,
        description:
          "SBP's own scheduled dogfooding agent — queries the PDC directory and pilot endpoint on an interval, generating baseline x402-global-challenge leaderboard volume (apps/sbp-agent).",
      }),
    });

    if (!res.ok) {
      const body: unknown = await res.json().catch(() => undefined);
      params.logger.warn("agent_self_register_failed", {
        status: res.status,
        body,
        action: "continuing without attribution submission this run",
      });
      return undefined;
    }

    const result = (await res.json()) as { agent_id?: string };
    if (!result.agent_id) {
      params.logger.warn("agent_self_register_missing_id", { action: "continuing without attribution submission this run" });
      return undefined;
    }

    params.logger.info("agent_self_registered", { agentId: result.agent_id });
    return result.agent_id;
  } catch (err) {
    params.logger.warn("agent_self_register_error", {
      error: err instanceof Error ? err.message : String(err),
      action: "continuing without attribution submission this run",
    });
    return undefined;
  }
}
