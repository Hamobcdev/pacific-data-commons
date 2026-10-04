import type { Context, MiddlewareHandler } from "hono";
import { logger } from "../lib/logger.js";
import type { AppBindings } from "../types.js";

/**
 * Lets the SBP website (apps/web, synergybcpacific.com) fetch PDC's
 * financial first-party endpoints without triggering x402 payment on
 * every request — external agents still pay as normal. Scoped to
 * exactly these 4 paths, not every paid route: a leaked
 * DASHBOARD_INTERNAL_KEY should expose at most these 4 endpoints' worth
 * of free access, not the whole platform's revenue surface. Must stay
 * in sync by hand with the actual route registrations in app.ts (same
 * "no single source of truth across files" caveat CLAUDE.md §26.2 notes
 * for dataCategories.ts) — there are only 4 entries, so this is a
 * deliberate, documented trade-off, not an oversight.
 */
export const DASHBOARD_BYPASS_PATHS: readonly string[] = ["/finance/crypto-rates", "/finance/fx", "/finance/arbitrage-signals", "/finance/remittance-corridors"];

/**
 * Pure decision logic, exported separately for direct unit testing
 * (same "pull the branching into a plain function" pattern used
 * throughout this codebase's other conditional logic). Fails closed: an
 * empty/unset configuredKey, a missing header, a mismatched header, or
 * a path outside DASHBOARD_BYPASS_PATHS all return false — bypass only
 * activates when every condition holds.
 */
export function isDashboardBypassRequest(path: string, providedKey: string | undefined, configuredKey: string | undefined): boolean {
  if (!configuredKey) return false; // unset/empty env value — bypass never activates
  if (!providedKey) return false;
  if (providedKey !== configuredKey) return false;
  return DASHBOARD_BYPASS_PATHS.includes(path);
}

/**
 * Wraps the real PdcPaymentGate middleware (from pdc-x402-adapter — this
 * never touches @x402 packages directly, per CLAUDE.md's adapter rule)
 * so a matching request skips it entirely and goes straight to the
 * route handler, while every other request is delegated to the real
 * payment gate unchanged. This is the only way to actually skip "just
 * the payment gate but still reach the route" in Hono's middleware
 * model: the payment gate is one middleware function applied once,
 * globally, in app.ts — an earlier middleware that simply doesn't call
 * next() would skip the route handler too, not just the payment check.
 * Wrapping the function call itself is what lets a bypassed request
 * fall through to next() (the route) while a normal request is handed
 * to the real gate, which enforces payment before its own next() runs.
 *
 * Same comparison posture as middleware/internalAuth.ts's
 * X-Internal-Api-Key check: a single shared secret compared server-side
 * against one env value, not a per-user credential, so a constant-time
 * comparison isn't the realistic threat model here either.
 *
 * Never logs the key value or header value itself — only that a bypass
 * occurred, plus the path/method, matching this codebase's structured
 * logger (logger.info ultimately calls console.log with JSON — "console
 * .info only" in substance, not the literal un-structured console.info
 * call every other log site in this codebase avoids).
 */
export function withDashboardBypass(paymentMiddleware: MiddlewareHandler<AppBindings>, configuredKey: string | undefined): MiddlewareHandler<AppBindings> {
  return async (c: Context<AppBindings>, next) => {
    const providedKey = c.req.header("x-internal-key");
    if (isDashboardBypassRequest(c.req.path, providedKey, configuredKey)) {
      logger.info("dashboard_internal_bypass", { path: c.req.path, method: c.req.method });
      return next();
    }
    // Must propagate the real gate's return value: when it rejects a
    // request directly (402/503) rather than calling next(), it does so by
    // returning a Response (e.g. c.json(...)) — which Hono only turns into
    // the actual outgoing response if the middleware wrapping it returns
    // that value too. c.json() itself has no side effect on the context; a
    // bare `await paymentMiddleware(c, next)` with no `return` here would
    // silently discard that Response and leave the context unfinalized.
    return paymentMiddleware(c, next);
  };
}
