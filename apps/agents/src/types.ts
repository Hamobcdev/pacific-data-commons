import type { Env } from "./types/env.js";

/** Hono context bindings shared across the app — set once in index.ts. */
export interface AppVariables {
  env: Env;
}

export interface AppBindings {
  Variables: AppVariables;
}
