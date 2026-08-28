import { Hono } from "hono";
import { logger } from "../lib/logger.js";
import { PSR_SPEC, PSR_ENDPOINT_SCHEMA } from "../lib/psrSpec.js";
import type { AppBindings } from "../types.js";

/**
 * Pacific Service Registry (PSR) specification routes — Session 35.
 *
 * Public, read-only, unauthenticated, no x402 payment gate: these are
 * specification documents (analogous to an OpenAPI or well-known discovery
 * document), not priced data. Not registered in index.ts's `paidRoutes`
 * array and carries no `discovery`/bazaar extension for the same reason
 * routes/verify.ts and routes/provider.ts don't.
 *
 * Served from an inline TS copy (lib/psrSpec.ts) rather than reading
 * apps/web/public/psr/v1/*.json directly — apps/directory-api and apps/web
 * are separate Railway services with separate build/deploy filesystems (see
 * each app's railway.json), so a cross-service file read isn't available at
 * runtime. See lib/psrSpec.ts's doc comment for the sync requirement.
 */
export const psrRoute = new Hono<AppBindings>();

psrRoute.get("/psr/v1/spec", (c) => {
  logger.info("psr_spec_requested", { path: c.req.path });

  if (!PSR_SPEC) {
    logger.error("psr_spec_missing");
    return c.json({ error: "psr_spec_unavailable", message: "PSR specification is temporarily unavailable." }, 503);
  }

  c.header("Cache-Control", "public, max-age=3600");
  return c.json(PSR_SPEC);
});

psrRoute.get("/psr/v1/schema", (c) => {
  logger.info("psr_schema_requested", { path: c.req.path });

  if (!PSR_ENDPOINT_SCHEMA) {
    logger.error("psr_schema_missing");
    return c.json({ error: "psr_schema_unavailable", message: "PSR endpoint schema is temporarily unavailable." }, 503);
  }

  c.header("Cache-Control", "public, max-age=3600");
  return c.json(PSR_ENDPOINT_SCHEMA);
});
