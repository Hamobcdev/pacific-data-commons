type LogFields = Record<string, unknown>;

/**
 * Structured JSON logging so Railway/any log aggregator can index fields —
 * CLAUDE.md P7: nothing that touches money or trust is opaque. Query
 * parameters and internal identifiers are logged; buyer wallet addresses are
 * fine to log here (transactions_log already stores them), never log
 * unrelated PII beyond what the schema already treats as retained.
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
