type LogFields = Record<string, unknown>;

/**
 * Structured JSON logging so Railway/any log aggregator can index fields —
 * CLAUDE.md P7: nothing that touches money or trust is opaque. Mirrors
 * apps/directory-api/src/lib/logger.ts; duplicated rather than shared
 * because these are separate Railway deployables with independent builds.
 *
 * Session 39 preamble requirement: "Log every request with timestamp,
 * route, and calling service" — the request-logging middleware in
 * index.ts calls this with a `caller` field derived from the request (see
 * that file), not a hardcoded identity.
 */
function emit(level: "info" | "warn" | "error", message: string, fields?: LogFields): void {
  const line = {
    level,
    message,
    time: new Date().toISOString(),
    ...fields,
  };
  const serialised = JSON.stringify(line);
  if (level === "error") {
    console.error(serialised);
  } else if (level === "warn") {
    console.warn(serialised);
  } else {
    console.log(serialised);
  }
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
