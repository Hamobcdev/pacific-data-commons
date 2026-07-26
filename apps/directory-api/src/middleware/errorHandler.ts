import type { ErrorHandler, NotFoundHandler } from "hono";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message }, err.status as never);
  }

  logger.error("unhandled_error", {
    path: c.req.path,
    method: c.req.method,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  return c.json({ error: "internal_error", message: "Something went wrong." }, 500);
};

export const notFoundHandler: NotFoundHandler = (c) =>
  c.json({ error: "not_found", message: `No route for ${c.req.method} ${c.req.path}` }, 404);
