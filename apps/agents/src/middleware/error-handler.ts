import type { ErrorHandler } from "hono";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * Never leaks a stack trace or raw error to the client (session brief:
 * "Never show a stack trace. Never show a raw API error."). A thrown
 * AppError carries a stable machine-readable `code` the web app maps to one
 * of its three error-state messages (insufficient_data,
 * sovereignty_blocked, service unavailable); anything else is logged in
 * full server-side and reduced to a generic message for the client.
 */
export const errorHandlerMiddleware: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message }, err.status as never);
  }

  logger.error("unhandled_error", {
    path: c.req.path,
    method: c.req.method,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  return c.json({ error: "internal_error", message: "Agent service is temporarily unavailable." }, 500);
};
