import type { Env } from "./types/env.js";

/** Hono context bindings shared across the app — set once in index.ts. */
export interface AppVariables {
  env: Env;
  /** The canonical dataset hash, computed once at startup (R7) and reused for every request. */
  datasetHash: string;
  /** ISO 8601 timestamp of when datasetHash was computed — reused by /provenance and /integrity. */
  hashComputedAt: string;
}

export interface AppBindings {
  Variables: AppVariables;
}
