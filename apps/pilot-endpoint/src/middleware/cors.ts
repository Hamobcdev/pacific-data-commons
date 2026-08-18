import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

/** Allow all origins — this is a public, agent-consumable data endpoint, not
 * a browser session-authenticated app, so there's no cookie/credential
 * boundary to protect with a stricter origin allowlist.
 *
 * Session 24 — exposeHeaders added (x402 Doctor's last remaining warning):
 * without Access-Control-Expose-Headers, a browser-based payer's
 * JavaScript can't read the PAYMENT-REQUIRED header off a 402 response or
 * PAYMENT-RESPONSE off a settled one — CORS hides both by default even
 * though the response reached the browser. Server-to-server callers (the
 * facilitator, sbp-agent) were never affected; this only unblocks a
 * browser wallet reading these headers directly. */
export const corsMiddleware: MiddlewareHandler = cors({ origin: "*", exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"] });
