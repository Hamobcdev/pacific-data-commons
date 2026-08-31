/** Expected, client-facing failure — thrown deliberately by route/service code.
 * Mirrors apps/directory-api/src/lib/errors.ts; duplicated rather than shared
 * because these are separate Railway deployables with independent builds. */
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

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, "not_found", message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, "invalid_request", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(403, "forbidden", message);
  }
}
