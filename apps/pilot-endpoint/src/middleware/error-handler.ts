import type { ErrorHandler } from "hono";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * R4: facilitator/payment failures must return a structured error, not an
 * unhandled exception. A thrown AppError here (e.g. /slice validation)
 * already cancelled the in-flight payment before reaching this handler —
 * see @pdc/x402-adapter's PdcPaymentGate.
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

  return c.json(
    { error: "internal_error", message: "Something went wrong.", data_warning: "SYNTHETIC DEMO ENDPOINT" },
    500,
  );
};
