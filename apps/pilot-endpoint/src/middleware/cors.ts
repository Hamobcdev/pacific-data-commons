import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

/** Allow all origins — this is a public, agent-consumable data endpoint, not
 * a browser session-authenticated app, so there's no cookie/credential
 * boundary to protect with a stricter origin allowlist. */
export const corsMiddleware: MiddlewareHandler = cors({ origin: "*" });
