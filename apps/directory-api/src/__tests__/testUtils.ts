import type { SupabaseClient } from "@supabase/supabase-js";

interface FakeTableConfig {
  data?: unknown[] | null;
  error?: { message: string } | null;
  count?: number | null;
  /** Row returned by `.insert(...).select(...).single()` — distinct from
   * `data` (the table's read rows) since an insert-then-select-back chain
   * (integrityService.recordIntegrityEvent's event-id return) needs its own
   * shape, independent of whatever this table's plain reads are configured
   * to return. */
  insertResult?: unknown;
  /** Session 17 — error returned by .update()/.insert() specifically, when
   * it must differ from the table's read error above (e.g. reads succeed,
   * the write fails). Defaults to `error`. */
  writeError?: { message: string } | null;
}

/**
 * Minimal fake for the chainable supabase-js query builder — implements only
 * the methods this service layer actually calls (from/select/eq/or/ilike/
 * range/order/maybeSingle/single/insert/update), each returning itself so
 * calls can chain in any order, and thenable so `await query` resolves like
 * the real client. Full payment-flow / facilitator integration testing
 * belongs to Session 4 (CLAUDE.md Part 3 §12 — end-to-end x402 payment
 * test), not this unit suite.
 */
export function createFakeSupabase(tableData: Record<string, FakeTableConfig>): SupabaseClient {
  const inserts: Array<{ table: string; row: unknown }> = [];
  const updates: Array<{ table: string; row: unknown }> = [];

  function builder(table: string) {
    const config = tableData[table] ?? { data: [], error: null, count: 0 };
    const state = { single: false, wroteTo: null as "insert" | "update" | null };

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
      single: () => {
        state.single = true;
        return chain;
      },
      insert: (row: unknown) => {
        inserts.push({ table, row });
        state.wroteTo = "insert";
        return chain;
      },
      update: (row: unknown) => {
        updates.push({ table, row });
        state.wroteTo = "update";
        return chain;
      },
      then: (resolve: (value: { data: unknown; error: unknown; count: number | null }) => void) => {
        if (state.wroteTo) {
          const error = config.writeError ?? config.error ?? null;
          const data = state.wroteTo === "insert" ? (config.insertResult ?? null) : null;
          return Promise.resolve({ data, error, count: null }).then(resolve);
        }
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
    __updates: updates,
  };

  return fake as unknown as SupabaseClient;
}

export function getFakeInserts(client: SupabaseClient): Array<{ table: string; row: unknown }> {
  return (client as unknown as { __inserts: Array<{ table: string; row: unknown }> }).__inserts;
}

export function getFakeUpdates(client: SupabaseClient): Array<{ table: string; row: unknown }> {
  return (client as unknown as { __updates: Array<{ table: string; row: unknown }> }).__updates;
}
