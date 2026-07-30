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
