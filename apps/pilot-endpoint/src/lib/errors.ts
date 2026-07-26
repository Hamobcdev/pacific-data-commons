/** Expected, client-facing failure — thrown deliberately by route handlers.
 * Reuses the pattern from apps/directory-api/src/lib/errors.ts: a thrown
 * error here causes @pdc/x402-adapter's payment middleware to cancel the
 * verified payment instead of settling it (see PdcPaymentGate — settlement
 * only happens after a handler returns a non-error response). */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, "invalid_request", message);
  }
}
