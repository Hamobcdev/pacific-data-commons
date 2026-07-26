type LogFields = Record<string, unknown>;

/** Structured JSON logging — same pattern as apps/directory-api/src/lib/logger.ts. */
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
