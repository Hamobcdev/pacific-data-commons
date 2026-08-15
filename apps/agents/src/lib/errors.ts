/** Expected, client-facing failure — thrown deliberately by route handlers.
 * Same pattern as apps/pilot-endpoint/src/lib/errors.ts and
 * apps/directory-api/src/lib/errors.ts. */
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

/** Session 17 (Decision 49) — thrown by BaseAgent.run() when
 * checkEndpointIntegrity() returns status 'fail' for a resolved endpoint,
 * blocking payment to it. Caught by the same per-endpoint try/catch that
 * already handles queryEndpoint failures (see base.ts) — a single
 * endpoint's tamper detection doesn't abort the whole run, since other
 * endpoints' payments may have already happened and must still be
 * attributed. */
export class IntegrityCheckFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrityCheckFailedError";
  }
}
