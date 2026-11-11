/**
 * Chain-agnostic internals shared by every PdcPaymentGate-style class in
 * this package (Algorand today; Base/Solana join via PdcUnifiedPaymentGate,
 * see unified-gate.ts).
 *
 * Factored out of what used to be schemes/algorand.ts's exclusive content.
 * None of this is new behavior for Algorand: x402ResourceServer.register()/
 * onAfterSettle() (@x402/core/server) take a bare Network + SchemeNetworkServer
 * and a chain-agnostic SettleResultContext — confirmed by reading @x402/core's
 * own type defs, not assumed — so the facilitator-timeout wrapper, the outer
 * request-level deadline, and the settle-listener plumbing were never actually
 * Algorand-specific. schemes/algorand.ts re-exports FacilitatorTimeoutError,
 * PaymentGateTimeoutError, raceWithTimeout, and PdcMerchantIdentity from here,
 * so existing callers (`import { FacilitatorTimeoutError } from
 * "@pdc/x402-adapter"`) are unaffected by this move.
 */
import { paymentMiddleware } from "@x402/hono";
import {
  HTTPFacilitatorClient,
  type FacilitatorClient,
  type RouteConfig,
  type RoutesConfig,
  x402ResourceServer,
} from "@x402/core/server";
import type { Network, PaymentPayload, PaymentRequirements, SettleResponse, SupportedResponse, VerifyResponse } from "@x402/core/types";
import { SettleError } from "@x402/core/types";
import type { MiddlewareHandler } from "hono";

/**
 * Required on every accepts[] entry for every PDC payment route, on every
 * chain (CLAUDE.md Section 14, Competition Context: "All endpoints tagged
 * x402-global-challenge in extra field"). Applied centrally in each chain's
 * addRoute() so no call site, on any chain, can forget it.
 */
export const COMPETITION_TAG = "x402-global-challenge";

/**
 * USDC decimals — identical across every USDC deployment this adapter
 * verifies against (Algorand ASA, Base ERC-20, Solana SPL token).
 */
export const USDC_DECIMALS = 6;

/**
 * Converts an atomic-unit amount string to its decimal USDC string, without
 * floating point (pads/slices the digit string directly). The inverse of
 * @x402/core/utils's convertToTokenAmount, which @x402/core does not itself
 * export a counterpart for. Algorand keeps using @x402/avm's own
 * convertFromTokenAmount (unchanged, untouched production path) — this is
 * for Base/Solana settlement logging, whose packages export no equivalent.
 */
export function atomicUsdcToDecimalString(atomic: string): string {
  const negative = atomic.startsWith("-");
  const digits = (negative ? atomic.slice(1) : atomic).padStart(USDC_DECIMALS + 1, "0");
  const whole = digits.slice(0, -USDC_DECIMALS).replace(/^0+(?=\d)/, "") || "0";
  const fraction = digits.slice(-USDC_DECIMALS).replace(/0+$/, "");
  const result = fraction ? `${whole}.${fraction}` : whole;
  return negative && result !== "0" ? `-${result}` : result;
}

/**
 * Session 24 — how a facilitator dashboard (GoPlausible's merchant list)
 * shows something better than a raw payTo address ("LN745U...N3YY") for a
 * service. There is no separate account-level "merchant profile" object
 * anywhere in @x402/core: RouteConfig itself carries `serviceName` /
 * `iconUrl` / `tags` per route — confirmed by reading @x402/core's own
 * RouteConfig type, not assumed. Set this once on a gate and every route
 * registered via addRoute() gets the same identity, so callers don't repeat
 * it per route. Shared by every chain's gate config, not Algorand-specific.
 *
 * `description` and `url` have no matching RouteConfig field at all in this
 * SDK version — carried in accepts[].extra instead (explicitly untyped/
 * arbitrary), so a facilitator that does read custom extra fields still
 * gets them, without fabricating spec fields @x402/core doesn't define.
 */
export interface PdcMerchantIdentity {
  /** -> RouteConfig.serviceName */
  serviceName: string;
  /** -> RouteConfig.iconUrl */
  iconUrl?: string;
  /** -> RouteConfig.tags */
  tags?: string[];
  /** -> accepts[].extra.merchant_description (no RouteConfig field exists for this) */
  description?: string;
  /** -> accepts[].extra.merchant_url (no RouteConfig field exists for this) */
  url?: string;
}

/**
 * GoPlausible (the pinned Algorand facilitator, CLAUDE.md Section 6) is a
 * documented SPOF; the same reasoning applies to PayAI for Base/Solana.
 * Traced live 10-25s hangs on /finance/*, /search, and
 * /algorand/wallet-balance (production smoke test, 2026-10-03) to
 * @x402/core's HTTPFacilitatorClient: its verify/settle/getSupported()
 * each call a bare fetch() with no timeout or AbortController at all
 * (confirmed by reading the vendored source in node_modules/@x402/core —
 * third-party code, not something this repo can edit directly).
 *
 * FACILITATOR_TIMEOUT_MS bounds every call any chain's gate makes through
 * the facilitator client createGuardedFacilitator() builds, to a hard
 * ceiling. This races the call rather than aborting it:
 * HTTPFacilitatorClient's fetch() accepts no signal parameter, so there is
 * nothing to cancel from the outside. Racing achieves the same outcome
 * that matters — the service stops waiting and responds — even though
 * the abandoned in-flight request isn't torn down at the network level.
 *
 * Raised from 8s to 15s on 2026-11-12 to accommodate GoPlausible cold-start
 * round trips on Base/Solana (confirmed via ray a58ccd9d9bad000c: 10,996ms
 * wall time on first Base payment before 8s timeout fired).
 */
export const FACILITATOR_TIMEOUT_MS = 15000;

export class FacilitatorTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Facilitator ${operation} did not respond within ${timeoutMs}ms`);
    this.name = "FacilitatorTimeoutError";
  }
}

/**
 * Races `run()` against a timer, rejecting with whatever `onTimeout()`
 * builds if the timer wins. Exported for direct unit testing of the race
 * logic in isolation.
 */
export function raceWithTimeout<T>(timeoutMs: number, run: () => Promise<T>, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), timeoutMs);
    run().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function withFacilitatorTimeout<T>(operation: string, timeoutMs: number, run: () => Promise<T>): Promise<T> {
  return raceWithTimeout(timeoutMs, run, () => new FacilitatorTimeoutError(operation, timeoutMs));
}

/**
 * Outer safety net for buildGuardedMiddleware(): bounds the *entire*
 * @x402/hono request-processing call, not just the facilitator client calls
 * TimeoutGuardedFacilitatorClient already bounds to FACILITATOR_TIMEOUT_MS.
 *
 * Confirmed root cause (live diagnosis, 2026-10-12, Algorand route):
 * @x402/hono's Bazaar/Ajv discovery-schema self-check hangs under
 * Cloudflare Workers' runtime restrictions with no timeout bound of its
 * own. This applies to @x402/hono's middleware chain generically, not to
 * any one chain's scheme.
 *
 * Set higher than FACILITATOR_TIMEOUT_MS (8000ms) so a genuine facilitator
 * hang is still reported as the more specific `payment_facilitator_
 * unavailable` 503 via findFacilitatorTimeoutError below, rather than being
 * preempted by this more generic one.
 */
export const PAYMENT_GATE_TIMEOUT_MS = 30000;

export class PaymentGateTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Payment gate did not complete within ${timeoutMs}ms`);
    this.name = "PaymentGateTimeoutError";
  }
}

/**
 * @x402/core's x402ResourceServer.initialize() catches whatever its
 * facilitator client's getSupported() throws and rethrows its own generic
 * Error with `{ cause: <original error> }` rather than propagating it
 * directly (confirmed by reading @x402/core 2.30.0's actual source, not
 * assumed) — so a FacilitatorTimeoutError thrown during the cold-start sync
 * path arrives here one level removed. Checks both the error itself and
 * one level of `.cause` rather than assuming which shape a given call site
 * produces.
 */
function findFacilitatorTimeoutError(error: unknown): FacilitatorTimeoutError | undefined {
  if (error instanceof FacilitatorTimeoutError) return error;
  if (error instanceof Error && error.cause instanceof FacilitatorTimeoutError) return error.cause;
  return undefined;
}

/** Wraps a real FacilitatorClient so every call any chain's gate makes is bounded by a configured timeout (default FACILITATOR_TIMEOUT_MS). */
class TimeoutGuardedFacilitatorClient implements FacilitatorClient {
  constructor(private readonly inner: FacilitatorClient, private readonly timeoutMs: number = FACILITATOR_TIMEOUT_MS) {}

  verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
    return withFacilitatorTimeout("verify", this.timeoutMs, () => this.inner.verify(paymentPayload, paymentRequirements));
  }

  settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    return withFacilitatorTimeout("settle", this.timeoutMs, () => this.inner.settle(paymentPayload, paymentRequirements));
  }

  getSupported(): Promise<SupportedResponse> {
    return withFacilitatorTimeout("getSupported", this.timeoutMs, () => this.inner.getSupported());
  }
}

/**
 * One guarded facilitator client per gate instance (Algorand, Base, Solana
 * alike) — every chain's gate constructor calls this instead of
 * constructing HTTPFacilitatorClient directly, and checkFacilitatorHealth
 * (schemes/algorand.ts) uses it too for the same reason. `timeoutMs`
 * defaults to FACILITATOR_TIMEOUT_MS (PdcPaymentGate's existing, unchanged
 * behavior) — PdcUnifiedPaymentGate passes its own
 * config.facilitatorTimeoutMs through when set.
 */
export function createGuardedFacilitator(facilitatorUrl: string, timeoutMs: number = FACILITATOR_TIMEOUT_MS): FacilitatorClient {
  return new TimeoutGuardedFacilitatorClient(new HTTPFacilitatorClient({ url: facilitatorUrl }), timeoutMs);
}

/**
 * Wraps a FacilitatorClient so its `getSupported()` only ever reports the
 * networks it's explicitly scoped to, regardless of what the underlying
 * facilitator actually advertises.
 *
 * Why this exists: x402ResourceServer.initialize() (confirmed by reading
 * @x402/core 2.30.0's actual source) merges every facilitator client in its
 * array into one Map<x402Version, Map<network, Map<scheme, ...>>>, keyed
 * strictly by (x402Version, network, scheme) — first facilitator to claim a
 * key wins, later claims to the same key are silently dropped. GoPlausible's
 * live /supported response now advertises `exact` on Base (eip155:8453) and
 * Solana mainnet/devnet in addition to Algorand — it is no longer
 * Algorand-only in practice, even though PdcUnifiedPaymentGate's own
 * historical assumption (and apps/directory-api's env.ts comment) said it
 * was. Without this wrapper, registering GoPlausible first in the array
 * silently makes it win Base/Solana too, by accident, regardless of intent.
 * This wrapper makes the scoping explicit and enforced in code instead of
 * an unenforced comment: a GoPlausible client scoped to [algorandCaip2]
 * can never shadow a Base/Solana entry again, no matter what GoPlausible's
 * own /supported response claims or how it changes in the future.
 *
 * verify()/settle() pass through unchanged — x402ResourceServer only ever
 * routes a verify/settle call to this client for a (network, scheme) this
 * same client already advertised via getSupported(), so no second check is
 * needed at that layer.
 */
export class ChainScopedFacilitatorClient implements FacilitatorClient {
  constructor(
    private readonly inner: FacilitatorClient,
    private readonly allowedNetworks: readonly Network[],
  ) {}

  async getSupported(): Promise<SupportedResponse> {
    const supported = await this.inner.getSupported();
    return {
      ...supported,
      kinds: supported.kinds.filter((kind) => this.allowedNetworks.includes(kind.network)),
    };
  }

  verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
    return this.inner.verify(paymentPayload, paymentRequirements);
  }

  settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    return this.inner.settle(paymentPayload, paymentRequirements);
  }
}

/**
 * Mirrors @x402/core's own internal SETTLEMENT_PENDING_REASON constant
 * (confirmed by reading @x402/core 2.30.0's actual source at
 * chunk-U5TAZTKB.mjs:713 — not exported from any public @x402/core entry
 * point, so duplicated here as a literal rather than imported).
 */
const SETTLEMENT_PENDING_REASON = "settlement_pending";

/**
 * Wraps two FacilitatorClients (intended: both already scoped to the same
 * chain via ChainScopedFacilitatorClient) so the resource server sees one
 * client, with `fallback` used only when `primary` genuinely can't serve
 * the request — for resilience, not for letting a client "pick" a
 * facilitator (the x402 spec gives clients no field to express that choice
 * with; facilitator selection is purely a resource-server concern).
 *
 * verify() is read-only (no funds move) and falls back on ANY primary
 * failure — a thrown error, or a resolved `{ isValid: false }` — since
 * retrying a read against a different facilitator carries no settlement
 * risk.
 *
 * settle() is deliberately NOT a blanket fallback-on-any-failure, because
 * settlement moves real funds and falling back to a different facilitator
 * after an AMBIGUOUS primary outcome risks a double-settlement:
 *   - A `FacilitatorTimeoutError` from `primary` (this file's own guarded
 *     client, above) means the call was abandoned without knowing whether
 *     the facilitator actually broadcast the transaction server-side
 *     (confirmed by this file's own FACILITATOR_TIMEOUT_MS doc comment:
 *     "the abandoned in-flight request isn't torn down"). Falling back to
 *     a different facilitator in that case could cause both facilitators
 *     to attempt settling the same authorization.
 *   - A `settlement_pending` outcome (thrown as @x402/core's SettleError,
 *     or returned with `success: false`) specifically means the primary
 *     facilitator already has a broadcast transaction it's tracking for
 *     reconciliation. @x402/core's own settleWithPendingRetry (confirmed
 *     by reading its source) retries this exact case by calling the SAME
 *     facilitatorClient again — i.e. this class's own settle() — relying
 *     on that facilitator's PendingSettlementStore to reconcile against
 *     the already-broadcast tx instead of re-broadcasting. Falling back
 *     to `fallback` here would break that reconciliation path entirely
 *     and risk a second, independent settlement attempt.
 * Both cases are re-thrown/returned unchanged so the existing retry
 * machinery (settleWithPendingRetry) and timeout handling
 * (buildGuardedMiddleware) apply exactly as they already do for a single
 * facilitator. Every other settle() failure — a clean, terminal rejection
 * that couldn't have resulted in a broadcast — is safe to hand to
 * `fallback`.
 */
export class FallbackFacilitatorClient implements FacilitatorClient {
  constructor(
    private readonly primary: FacilitatorClient,
    private readonly fallback: FacilitatorClient,
  ) {}

  /**
   * Queries both concurrently (read-only discovery, not a funds-moving
   * call — no settlement-ordering concern here) and unions their kinds,
   * rather than trying primary then falling back only on a thrown error.
   * This matters because an empty-but-successful `{ kinds: [] }` from
   * primary (it simply doesn't support this chain, or hasn't advertised
   * it yet) is NOT a throw — a naive try/catch would silently report zero
   * support for this chain even though fallback can actually serve it,
   * which would make x402ResourceServer.initialize()'s merge treat this
   * chain as entirely unsupported (missing_facilitator) instead of
   * resolving through fallback. Throws only if BOTH fail.
   */
  async getSupported(): Promise<SupportedResponse> {
    const [primaryResult, fallbackResult] = await Promise.allSettled([this.primary.getSupported(), this.fallback.getSupported()]);
    const fulfilled = [primaryResult, fallbackResult].filter(
      (r): r is PromiseFulfilledResult<SupportedResponse> => r.status === "fulfilled",
    );
    if (fulfilled.length === 0) {
      throw primaryResult.status === "rejected" ? primaryResult.reason : (fallbackResult as PromiseRejectedResult).reason;
    }
    const results = fulfilled.map((r) => r.value);
    return {
      kinds: results.flatMap((r) => r.kinds),
      extensions: [...new Set(results.flatMap((r) => r.extensions))],
      signers: Object.assign({}, ...results.map((r) => r.signers)),
    };
  }

  async verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
    try {
      const result = await this.primary.verify(paymentPayload, paymentRequirements);
      if (result.isValid) return result;
      return await this.fallback.verify(paymentPayload, paymentRequirements);
    } catch {
      return this.fallback.verify(paymentPayload, paymentRequirements);
    }
  }

  async settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    try {
      const result = await this.primary.settle(paymentPayload, paymentRequirements);
      if (result.success || result.errorReason === SETTLEMENT_PENDING_REASON) {
        return result;
      }
      return await this.fallback.settle(paymentPayload, paymentRequirements);
    } catch (error) {
      if (error instanceof FacilitatorTimeoutError) throw error;
      if (error instanceof SettleError && error.errorReason === SETTLEMENT_PENDING_REASON) throw error;
      return this.fallback.settle(paymentPayload, paymentRequirements);
    }
  }
}

export function parseJsonSafely(buffer: Buffer | undefined): unknown {
  if (!buffer || buffer.length === 0) return undefined;
  try {
    return JSON.parse(buffer.toString("utf-8"));
  } catch {
    return undefined;
  }
}

/**
 * Builds the guarded Hono middleware for any x402ResourceServer +
 * routesConfig pair. Every chain's gate (PdcPaymentGate, and
 * PdcUnifiedPaymentGate for all three chains at once) calls this instead of
 * hand-rolling its own try/catch/race block.
 *
 * FACILITATOR-TIMEOUT FIX (feat/unified-payment-gate) — root cause and why
 * the previous try/catch-around-inner() approach could never work:
 *
 * @x402/hono's paymentMiddleware (confirmed by reading its actual 2.30.0
 * source, not assumed) handles a cold-start facilitator sync failure
 * ENTIRELY INTERNALLY: `initializeHttpServer()`'s catch calls
 * getFacilitatorResponseError(error), which only recognizes
 * FacilitatorResponseError (a facilitator that *responded* with an error) —
 * not FacilitatorTimeoutError (one that never responded at all) — so it
 * falls through to `internalErrorResponse(c, error)`, which RETURNS (does
 * not throw) a bare `c.json({ error: "Internal Server Error" }, 500)`.
 * Because that 500 is a return value, not a thrown error, no try/catch
 * wrapped around `inner(c, next)` — however it's written — ever sees an
 * exception to convert. The 500's body also carries no distinguishing
 * signal (confirmed: internalErrorResponse's body is the same literal
 * string for every unrelated internal error too), so detecting it
 * after the fact by inspecting the Response isn't reliable either.
 *
 * The only place that can actually observe the timeout as a *rejection* is
 * ensureInitialized() below, which calls resourceServer.initialize()
 * directly — the same method @x402/hono calls internally, but awaited
 * here first, before @x402/hono's own (lossy) handling ever gets a chance
 * to swallow it. Reuses the exact existing `payment_facilitator_
 * unavailable` 503 body the outer race below already produces for a
 * mid-request facilitator hang — same failure class, same contract,
 * deliberately not a new error shape, since apps/directory-api's own
 * facilitatorTimeout.test.ts already pins that exact body. Memoized
 * exactly like @x402/hono's own internal
 * isInitialized/initPromise pair, so this only ever costs one real
 * getSupported() round trip per cold start, not one per request — the
 * same bounded, one-time cost the existing keep-warm cron trigger
 * (apps/directory-api/src/worker.ts's scheduled() handler) already
 * deliberately pays by hitting a real paid route on an idle isolate. The
 * one behavior change from this fix: a request to an *unpaid* route can
 * now also pay that one-time cold-start cost if it happens to be the very
 * first request an isolate ever serves (previously, only a paid route's
 * first request did) — accepted as consistent with that existing
 * precedent rather than worth the complexity of replicating @x402/hono's
 * own path-to-payment-requirement matching here just to skip it for free
 * routes.
 *
 * On a non-timeout initialize() failure (e.g. the facilitator responded
 * with a real error, not a hang), this falls through unchanged — inner()
 * runs and @x402/hono's own existing (pre-this-fix) handling applies,
 * since this fix is scoped to the timeout case only.
 */
export function buildGuardedMiddleware(resourceServer: x402ResourceServer, routesConfig: Record<string, RouteConfig>): MiddlewareHandler {
  const inner = paymentMiddleware(routesConfig as RoutesConfig, resourceServer);

  let initPromise: Promise<void> | undefined;
  function ensureInitialized(): Promise<void> {
    if (!initPromise) {
      initPromise = resourceServer.initialize().catch((error: unknown) => {
        // Let the next request retry — a failed cold start must not poison
        // every future request for the lifetime of this isolate.
        initPromise = undefined;
        throw error;
      });
    }
    return initPromise;
  }

  return async (c, next) => {
    try {
      await ensureInitialized();
    } catch (error) {
      const timeoutError = findFacilitatorTimeoutError(error);
      if (timeoutError) {
        // eslint-disable-next-line no-console
        console.error("x402_facilitator_timeout", { message: timeoutError.message, path: c.req.path, method: c.req.method });
        c.header("Retry-After", "10");
        return c.json({ error: "payment_facilitator_unavailable", retry_after: 10 }, 503);
      }
      // Non-timeout init failure — fall through to inner()'s own existing
      // handling for this case, unchanged by this fix.
    }

    try {
      return await raceWithTimeout(PAYMENT_GATE_TIMEOUT_MS, () => inner(c, next), () => new PaymentGateTimeoutError(PAYMENT_GATE_TIMEOUT_MS));
    } catch (error) {
      if (error instanceof PaymentGateTimeoutError) {
        // eslint-disable-next-line no-console
        console.error("x402_payment_gate_timeout", { message: error.message, path: c.req.path, method: c.req.method });
        c.header("Retry-After", "5");
        return c.json({ error: "payment_gate_timeout", retry_after: 5 }, 503);
      }
      const timeoutError = findFacilitatorTimeoutError(error);
      if (timeoutError) {
        // eslint-disable-next-line no-console
        console.error("x402_facilitator_timeout", { message: timeoutError.message, path: c.req.path, method: c.req.method });
        c.header("Retry-After", "10");
        return c.json({ error: "payment_facilitator_unavailable", retry_after: 10 }, 503);
      }
      throw error;
    }
  };
}
