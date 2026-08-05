import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Existing tests (validation.test.ts, rate-limit.test.ts,
 * algorand-validate.test.ts) all use relative imports and only exercise
 * pure, dependency-free modules — there was previously no need for the
 * `@/*` alias tsconfig.json already defines for app code. Session 10's
 * otp-flow.test.ts needs it to mock @/lib/supabase/server (see that test
 * file's own comment for why: it's how a unit test avoids ever executing
 * next/headers's cookies() outside a request context).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
