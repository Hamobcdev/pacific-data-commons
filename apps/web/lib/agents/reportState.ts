import type { AgentOutput } from "@pdc/shared-types";

/** Completed report persistence (Session 13, P8) — sessionStorage, not
 * localStorage: a report should survive a same-tab refresh while the user
 * is reading it, but must not resurface days later in a fresh session the
 * way a saved form draft (formState.ts, localStorage) intentionally does.
 * One key per agent slug, same per-flow reasoning as formState.ts. */
function storageKey(slug: string): string {
  return `pdc-agent-report:${slug}`;
}

export function loadAgentReport(slug: string): AgentOutput | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(slug));
    return raw ? (JSON.parse(raw) as AgentOutput) : null;
  } catch {
    return null;
  }
}

export function saveAgentReport(slug: string, output: AgentOutput): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(slug), JSON.stringify(output));
  } catch {
    // sessionStorage full or unavailable — fail silently, same posture as
    // formState.ts's saveAgentRunForm.
  }
}

export function clearAgentReport(slug: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(storageKey(slug));
}
