import type { SupabaseClient } from "@supabase/supabase-js";
import type { KVNamespace } from "@cloudflare/workers-types";

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
 * range/order/limit/gte/lte/not/overlaps/maybeSingle/single/insert/update),
 * each returning itself so calls can chain in any order, and thenable so
 * `await query` resolves like the real client. Full payment-flow /
 * facilitator integration testing belongs to Session 4 (CLAUDE.md Part 3
 * §12 — end-to-end x402 payment test), not this unit suite.
 */
export function createFakeSupabase(tableData: Record<string, FakeTableConfig>): SupabaseClient {
  const inserts: Array<{ table: string; row: unknown }> = [];
  const updates: Array<{ table: string; row: unknown }> = [];
  // Hotfix (agentSelfRegisterService lookup-column regression) — records
  // which column(s) .eq() filtered on per table, so a test can assert the
  // service queried the column it's supposed to, not just that it got back
  // whatever `data` this fake was configured with regardless of filter.
  const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];

  function builder(table: string) {
    const config = tableData[table] ?? { data: [], error: null, count: 0 };
    const state = { single: false, wroteTo: null as "insert" | "update" | null };

    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        eqCalls.push({ table, column, value });
        return chain;
      },
      or: () => chain,
      ilike: () => chain,
      range: () => chain,
      order: () => chain,
      limit: () => chain,
      gte: () => chain,
      lte: () => chain,
      not: () => chain,
      overlaps: () => chain,
      maybeSingle: () => {
        state.single = true;
        return chain;
      },
      single: () => {
        state.single = true;
        return chain;
      },
      insert: (row: unknown) => {
        // Session 18 — flatten a batch insert (an array of rows, as
        // notificationService.dispatchUpdateNotifications does for agent
        // wallets) into one __inserts entry per row, matching what a caller
        // querying the real table back would see, rather than one entry
        // holding the whole array.
        if (Array.isArray(row)) {
          for (const r of row) inserts.push({ table, row: r });
        } else {
          inserts.push({ table, row });
        }
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
    __eqCalls: eqCalls,
  };

  return fake as unknown as SupabaseClient;
}

export function getFakeInserts(client: SupabaseClient): Array<{ table: string; row: unknown }> {
  return (client as unknown as { __inserts: Array<{ table: string; row: unknown }> }).__inserts;
}

export function getFakeUpdates(client: SupabaseClient): Array<{ table: string; row: unknown }> {
  return (client as unknown as { __updates: Array<{ table: string; row: unknown }> }).__updates;
}

export function getFakeEqCalls(client: SupabaseClient): Array<{ table: string; column: string; value: unknown }> {
  return (client as unknown as { __eqCalls: Array<{ table: string; column: string; value: unknown }> }).__eqCalls;
}

/**
 * Minimal Map-based KVNamespace fake — real KV only stores strings, so
 * get/put mirror that: put() takes whatever string the caller already
 * JSON.stringify'd, and get(key, { type: "json" }) JSON.parses it back on
 * read, same as the real binding. Only the subset this codebase's KV
 * callers actually use (get with optional { type: "json" }, put) is
 * implemented — not the full KVNamespace interface.
 */
export function createFakeKv(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initial));

  const fake = {
    get: async (key: string, options?: { type?: string }) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return options?.type === "json" ? JSON.parse(raw) : raw;
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    __store: store,
  };

  return fake as unknown as KVNamespace;
}

/** Reads back the fake KV's underlying Map, for asserting what a handler wrote. */
export function getFakeKvStore(kv: KVNamespace): Map<string, string> {
  return (kv as unknown as { __store: Map<string, string> }).__store;
}
