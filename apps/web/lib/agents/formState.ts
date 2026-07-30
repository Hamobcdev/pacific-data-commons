/** Per-agent run-form local state — P8 (Pacific connectivity: forms must
 * save state). One localStorage key per agent slug rather than one shared
 * key, since a user might have an in-progress fisheries query and an
 * in-progress trade query at the same time without them clobbering each
 * other — same key-per-flow reasoning as lib/onboarding/state.ts, just
 * scoped per agent instead of one global flow. */
export interface AgentRunFormState {
  parameters: Record<string, string>;
  userWallet: string;
}

function storageKey(slug: string): string {
  return `pdc-agent-run:${slug}`;
}

export function loadAgentRunForm(slug: string): AgentRunFormState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(slug));
    return raw ? (JSON.parse(raw) as AgentRunFormState) : null;
  } catch {
    return null;
  }
}

export function saveAgentRunForm(slug: string, state: AgentRunFormState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — fail silently, same posture as
    // lib/onboarding/state.ts's saveLocalState.
  }
}
