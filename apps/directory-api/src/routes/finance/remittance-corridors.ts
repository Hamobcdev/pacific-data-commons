import { Hono } from "hono";
import { getRemittanceSnapshot, CORRIDORS, CRYPTO_TOKENS, BENCHMARK_SEND_AMOUNT_USD, type CryptoToken } from "../../services/pacificRemittanceService.js";
import { ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01 — quarterly source data,
// lightweight fetch). See services/pacificRemittanceService.ts for the
// full sourcing doc comment, including why traditional_rails is null for
// every corridor this session (World Bank's RPW API is entirely
// Cloudflare-blocked for server-side requests, confirmed live).
//
// Query params (all optional):
//   corridor — one corridor id, e.g. ?corridor=AUS_WST. 400 if unknown.
//   min_saving_pct — only corridors where potential_saving_pct exceeds
//     this. A corridor with potential_saving_pct: null (traditional_rails
//     unavailable — true for every corridor this session) never passes
//     any threshold > 0, since "exceeds an unknown value" can't be
//     asserted true.
//   token — one crypto token (XRP/XLM/ALGO). Filters crypto_rails down to
//     just that token on every returned corridor. 400 if unknown.
export const pacificRemittanceRoute = new Hono<AppBindings>();

pacificRemittanceRoute.get("/finance/remittance-corridors", async (c) => {
  const corridorRaw = c.req.query("corridor");
  if (corridorRaw !== undefined && !CORRIDORS.some((corr) => corr.corridor_id === corridorRaw)) {
    throw new ValidationError(`corridor must be one of: ${CORRIDORS.map((corr) => corr.corridor_id).join(", ")} (got "${corridorRaw}")`);
  }

  const tokenRaw = c.req.query("token")?.toUpperCase();
  if (tokenRaw !== undefined && !CRYPTO_TOKENS.some((t) => t.token === tokenRaw)) {
    throw new ValidationError(`token must be one of: ${CRYPTO_TOKENS.map((t) => t.token).join(", ")} (got "${tokenRaw}")`);
  }
  const token = tokenRaw as CryptoToken | undefined;

  const minSavingRaw = c.req.query("min_saving_pct");
  let minSavingPct = 0;
  if (minSavingRaw !== undefined) {
    minSavingPct = Number(minSavingRaw);
    if (!Number.isFinite(minSavingPct)) {
      throw new ValidationError("min_saving_pct must be a number");
    }
  }

  const snapshot = await getRemittanceSnapshot();
  let corridors = snapshot.corridors;

  if (corridorRaw) {
    corridors = corridors.filter((corr) => corr.corridor_id === corridorRaw);
  }
  if (minSavingPct > 0) {
    corridors = corridors.filter((corr) => corr.potential_saving_pct !== null && corr.potential_saving_pct > minSavingPct);
  }
  if (token) {
    corridors = corridors.map((corr) => ({ ...corr, crypto_rails: corr.crypto_rails.filter((r) => r.token === token) }));
  }

  c.header("Cache-Control", "public, max-age=86400");

  return c.json({
    corridors,
    meta: {
      benchmark_send_amount_usd: BENCHMARK_SEND_AMOUNT_USD,
      corridors_returned: corridors.length,
      note: "Crypto rail costs are network fees only. Local on-ramp and off-ramp costs are additional and vary by provider and country.",
      not_financial_advice: true,
      data_sources: ["World Bank Remittance Prices Worldwide", "fawazahmed0/currency-api / ExchangeRate-API / Frankfurter (ECB) — see /finance/fx", "Static crypto network fee estimates"],
      generated_at: snapshot.generated_at,
    },
    fetch_warnings: snapshot.fetch_warnings,
  });
});
