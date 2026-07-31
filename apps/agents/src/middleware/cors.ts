import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

/** Allow all origins — this service is called server-side from
 * apps/web's server actions, not directly from a browser session, so
 * there's no cookie/credential boundary to protect with a stricter origin
 * allowlist (same reasoning as apps/pilot-endpoint's cors middleware). */
export const corsMiddleware: MiddlewareHandler = cors({ origin: "*" });
