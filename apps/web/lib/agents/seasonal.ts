import { createServerClient } from "@/lib/supabase/server";

/**
 * Read-only seasonal context lookup for the run form (Deliverable 4/7) — a
 * banner shown before dry-run so the user knows a seasonal factor (e.g.
 * cyclone season) may be reflected in the synthesis, before they've entered
 * any parameters. The anon client is fine here: seasonal_contexts has a
 * public read RLS policy (session6_1_agent_schema.sql) for exactly this.
 * The synthesis-time lookup that actually shapes the prompt happens
 * server-side in apps/agents/src/lib/seasonal.ts — this is a display-only
 * duplicate read, not the authoritative one.
 */
export async function getCurrentSeasonalNote(geography: string, domain: "fisheries" | "agriculture" | "climate"): Promise<string | null> {
  try {
    const supabase = createServerClient();
    const month = new Date().getUTCMonth() + 1;

    const { data, error } = await supabase
      .from("seasonal_contexts")
      .select("context_notes, month_start, month_end")
      .eq("geography_scope", geography)
      .eq("domain", domain)
      .not("reviewed_at", "is", null);

    if (error || !data) return null;

    const match = data.find((row) => {
      const start = row.month_start as number;
      const end = row.month_end as number;
      return start <= end ? month >= start && month <= end : month >= start || month <= end;
    });
    return (match?.context_notes as string | undefined) ?? null;
  } catch {
    return null;
  }
}
