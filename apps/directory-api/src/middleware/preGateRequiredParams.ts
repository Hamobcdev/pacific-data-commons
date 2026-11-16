import type { Context, MiddlewareHandler } from "hono";
import { ValidationError } from "../lib/errors.js";
import type { AppBindings } from "../types.js";

/**
 * Closes the gap reported by Frits Zwager (Fizzl/x402 Doctor, 10 Nov 2026):
 * the x402 payment gate is mounted globally in app.ts, before any
 * app.route() handler is dispatched, so for a route with a required query
 * param, the gate always fires before that route's own handler gets a
 * chance to validate anything. A request missing the param gets a 402 with
 * no Payment-Required header — unactionable for an x402 agent — instead of
 * the 400 the handler would have thrown had it ever run.
 *
 * This middleware must be mounted before the payment gate's own
 * middleware. It is deliberately narrow: it checks only that each affected
 * route's required field(s) are PRESENT (a non-empty value), reusing the
 * exact param name(s) and error message(s) each route's own handler/service
 * already throws. It does not duplicate that handler's value-correctness
 * validation (country enum membership, year range, etc.) — that still runs
 * exactly as before, after payment, unchanged.
 *
 * Required fields across the affected routes are named query params, each
 * independently required (checked in the same order the real handler/
 * service checks them, so the first missing one's message matches what the
 * handler would have thrown first). GET_RULES.
 */

interface NamedParamCheck {
  /** Field name as it appears in the query string (GET) or the POST
   *  gateway's JSON body's `params` object — identical on both surfaces
   *  for every route that has a POST Agent Dataset Gateway counterpart. */
  param: string;
  /** Exact message the route's own GET handler/service already throws for
   *  a missing value — reused verbatim, not reworded. */
  message: string;
  /** Overrides `message` for the POST Agent Dataset Gateway surface only.
   *  Only wallet-balance's gateway case throws a different (JSON-body-
   *  shaped) message than its GET counterpart; every other route's
   *  message is identical on both surfaces because both call the same
   *  service parser with the same raw value. */
  postMessage?: string;
}

// GET path -> ordered list of named-field checks. Most routes have exactly
// one required field (a 1-element array); /tourism/transport/routes has two
// (origin, destination), each independently required with its own message,
// checked in the same order tourismTransportService.ts's queryTransportRoutes
// checks them (origin first) — matches which message a request missing both
// would have gotten from the real handler had it ever run.
const GET_RULES: ReadonlyMap<string, NamedParamCheck[]> = new Map([
  ["/pacific/weather", [{ param: "country", message: "country is required, e.g. ?country=WS" }]],
  [
    "/algorand/wallet-balance",
    [{ param: "address", message: "address query parameter is required, e.g. ?address=ALGORAND_ADDRESS_58_CHARS" }],
  ],
  ["/climate/ocean-temperature", [{ param: "country", message: "country is required, e.g. ?country=WS" }]],
  ["/finance/fiji-gdp", [{ param: "year", message: "year is required, e.g. ?year=2019" }]],
  ["/fisheries/pacific-purse-seine", [{ param: "year", message: "year is required, e.g. ?year=2020" }]],
  ["/finance/crypto-history", [{ param: "symbol", message: "symbol query parameter is required, e.g. ?symbol=ALGO" }]],
  ["/intelligence/pacific-travel", [{ param: "destination", message: "destination is required, e.g. ?destination=WS" }]],
  [
    "/tourism/transport/routes",
    [
      { param: "origin", message: "origin is required" },
      { param: "destination", message: "destination is required" },
    ],
  ],
]);

// Agent Dataset Gateway dataset id (the :id in POST /api/v1/datasets/:id/query)
// -> rule. Mirrors the named-field half of GET_RULES above — same 7
// datasets, same param names (the gateway's own switch-case in
// agentDatasetGateway.ts calls the identical service parser with
// params?.<field> for 6 of these 7 datasets; only wallet-balance has its own
// inline check with a body-shaped message, carried here via postMessage).
// /tourism/transport/routes and /tourism/search have no POST Agent Dataset
// Gateway counterpart, so neither appears here.
const POST_GATEWAY_RULES: ReadonlyMap<string, NamedParamCheck> = new Map([
  ["weather", { param: "country", message: "country is required, e.g. ?country=WS" }],
  [
    "wallet-balance",
    {
      param: "address",
      message: "address query parameter is required, e.g. ?address=ALGORAND_ADDRESS_58_CHARS",
      postMessage: 'address is required, e.g. { "params": { "address": "ALGORAND_ADDRESS_58_CHARS" } }',
    },
  ],
  ["ocean-temperature", { param: "country", message: "country is required, e.g. ?country=WS" }],
  ["fiji-gdp", { param: "year", message: "year is required, e.g. ?year=2019" }],
  ["pacific-purse-seine", { param: "year", message: "year is required, e.g. ?year=2020" }],
  ["crypto-history", { param: "symbol", message: "symbol query parameter is required, e.g. ?symbol=ALGO" }],
  ["pacific-travel", { param: "destination", message: "destination is required, e.g. ?destination=WS" }],
]);

const AGENT_DATASET_GATEWAY_QUERY_PATH = /^\/api\/v1\/datasets\/([^/]+)\/query$/;

/**
 * True for undefined/null/whitespace-only string — false for every other
 * value, including a number (a POST body's `year` may arrive as a JSON
 * number, not a string) or any non-empty string. Presence only, never a
 * value check — matches this middleware's narrow scope.
 */
function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

/**
 * Pure check, exported for direct unit testing without a Hono Context.
 * Returns the message to reject the request with, or null if this request
 * needs no pre-gate check at all (not one of the affected routes) or already
 * has its required value(s) present.
 */
export function findMissingRequiredParamMessage(
  method: string,
  path: string,
  query: (name: string) => string | undefined,
  jsonBodyParams: Record<string, unknown> | undefined,
): string | null {
  if (method === "GET") {
    const checks = GET_RULES.get(path);
    if (!checks) return null;
    for (const check of checks) {
      if (!isPresent(query(check.param))) return check.message;
    }
    return null;
  }

  if (method === "POST") {
    const match = AGENT_DATASET_GATEWAY_QUERY_PATH.exec(path);
    if (!match) return null;
    const rule = POST_GATEWAY_RULES.get(match[1] as string);
    if (!rule) return null;
    return isPresent(jsonBodyParams?.[rule.param]) ? null : (rule.postMessage ?? rule.message);
  }

  return null;
}

/**
 * Must be mounted before paymentGate.middleware() in app.ts. Peeks at the
 * JSON body only for a POST request whose path matches the Agent Dataset
 * Gateway's query route for one of the 7 affected datasets — every other
 * request (including every other POST) never has its body touched here.
 * Hono's HonoRequest caches a parsed body by type, so this peek doesn't
 * consume anything the route handler's own later `c.req.json()` call
 * needs — both resolve from the same cache entry.
 */
export function preGateRequiredParamValidation(): MiddlewareHandler<AppBindings> {
  return async (c: Context<AppBindings>, next) => {
    const method = c.req.method;
    const path = c.req.path;

    let jsonBodyParams: Record<string, unknown> | undefined;
    if (method === "POST" && AGENT_DATASET_GATEWAY_QUERY_PATH.test(path)) {
      const body = await c.req.json().catch(() => undefined);
      jsonBodyParams = (body as { params?: Record<string, unknown> } | undefined)?.params;
    }

    const message = findMissingRequiredParamMessage(method, path, (name) => c.req.query(name), jsonBodyParams);
    if (message) {
      throw new ValidationError(message);
    }

    await next();
  };
}
