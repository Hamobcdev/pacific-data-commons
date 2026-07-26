import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";

/** Attaches a request id to every response (`X-Request-Id`) — CLAUDE.md P7:
 * every request touching a paid route should be traceable end to end. */
export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? randomUUID();
  c.header("X-Request-Id", requestId);
  await next();
};
