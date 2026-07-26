import type { SupabaseClient } from "@supabase/supabase-js";

interface FakeTableConfig {
  data?: unknown[] | null;
  error?: { message: string } | null;
  count?: number | null;
}

/**
 * Minimal fake for the chainable supabase-js query builder — implements only
 * the methods this service layer actually calls (from/select/eq/or/ilike/
 * range/order/maybeSingle/insert), each returning itself so calls can chain
 * in any order, and thenable so `await query` resolves like the real client.
 * Full payment-flow / facilitator integration testing belongs to Session 4
 * (CLAUDE.md Part 3 §12 — end-to-end x402 payment test), not this unit
 * suite.
 */
export function createFakeSupabase(tableData: Record<string, FakeTableConfig>): SupabaseClient {
  const inserts: Array<{ table: string; row: unknown }> = [];

  function builder(table: string) {
    const config = tableData[table] ?? { data: [], error: null, count: 0 };
    const state = { single: false };

    const chain = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      ilike: () => chain,
      range: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => {
        state.single = true;
        return chain;
      },
      insert: (row: unknown) => {
        inserts.push({ table, row });
        return Promise.resolve({ data: null, error: config.error ?? null });
      },
      then: (resolve: (value: { data: unknown; error: unknown; count: number | null }) => void) => {
        const rows = config.data ?? [];
        const result = state.single
          ? { data: rows[0] ?? null, error: config.error ?? null, count: config.count ?? null }
          : { data: rows, error: config.error ?? null, count: config.count ?? rows.length };
        return Promise.resolve(result).then(resolve);
      },
    };
    return chain;
  }

  const fake = {
    from: (table: string) => builder(table),
    __inserts: inserts,
  };

  return fake as unknown as SupabaseClient;
}

export function getFakeInserts(client: SupabaseClient): Array<{ table: string; row: unknown }> {
  return (client as unknown as { __inserts: Array<{ table: string; row: unknown }> }).__inserts;
}
