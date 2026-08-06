import type { AgentInput, AgentOutput } from "@pdc/shared-types";
import type { AgentSlug } from "./types";

export type AgentRunErrorCode = "insufficient_data" | "sovereignty_blocked" | "invalid_request" | "rate_limited" | "unavailable";

export interface AgentRunFailure {
  success: false;
  code: AgentRunErrorCode;
  message: string;
}

export interface AgentRunSuccess {
  success: true;
  output: AgentOutput;
}

export type AgentRunResult = AgentRunSuccess | AgentRunFailure;

/** Exported for get-quote.ts / execute-agent.ts (Session 13) — same
 * AGENTS_SERVICE_URL resolution and error message runAgent() already uses,
 * kept in one place rather than duplicated per caller. */
export function agentsServiceUrl(): string {
  const url = process.env.AGENTS_SERVICE_URL;
  if (!url) {
    throw new Error(
      "AGENTS_SERVICE_URL is not configured. Add it to your .env.local file pointing to the @pdc/agents service. See .env.example for the correct variable name.",
    );
  }
  return url.replace(/\/$/, "");
}

function mapErrorCode(raw: string | undefined): AgentRunErrorCode {
  switch (raw) {
    case "insufficient_data":
    case "sovereignty_blocked":
    case "rate_limited":
    case "invalid_request":
      return raw;
    default:
      return "unavailable";
  }
}

/**
 * Core agent execution engine (Deliverable 7) — the one place apps/web
 * talks to apps/agents over HTTP. Both run-agent.ts (dry_run: false) and
 * dry-run-agent.ts (dry_run: true) call this; it never throws — a network
 * failure or a non-2xx response both come back as an AgentRunFailure so
 * server actions can render one of the three UI error states without a
 * try/catch of their own (session brief: "Never show a stack trace. Never
 * show a raw API error.").
 */
export async function runAgent(slug: AgentSlug, input: AgentInput): Promise<AgentRunResult> {
  let url: string;
  try {
    url = `${agentsServiceUrl()}/agents/${slug}`;
  } catch (err) {
    return { success: false, code: "unavailable", message: err instanceof Error ? err.message : String(err) };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => undefined);

    if (!res.ok) {
      const errorBody = body as { error?: string; message?: string } | undefined;
      return {
        success: false,
        code: mapErrorCode(errorBody?.error),
        message: errorBody?.message ?? "Agent service is temporarily unavailable. You were not charged.",
      };
    }

    return { success: true, output: body as AgentOutput };
  } catch {
    return {
      success: false,
      code: "unavailable",
      message: "Agent service is temporarily unavailable. You were not charged. Please try again.",
    };
  }
}
