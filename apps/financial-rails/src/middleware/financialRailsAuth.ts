import type { MiddlewareHandler } from "hono";
import { AppError } from "../lib/errors.js";
import type { AppBindings } from "../types.js";

/**
 * Gates every route in this service except /health. Callers send the
 * shared secret as `Authorization: Bearer <FINANCIAL_RAILS_KEY>` — same
 * scheme as apps/directory-api's complianceAuth.ts, a distinct trust
 * boundary and distinct secret from that service's COMPLIANCE_API_KEY and
 * INTERNAL_API_KEY. Only two callers ever hold this key: apps/web's
 * server-side dashboard data fetch (Component B) and the compliance
 * engine (Session 38, when it moves off directory-api). Non-timing-safe
 * comparison, same posture as the equivalent directory-api middleware —
 * one shared secret compared against one env value, not a per-user
 * credential.
 */
export const financialRailsAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const header = c.req.header("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  const expected = c.get("env").FINANCIAL_RAILS_KEY;

  if (!provided || provided !== expected) {
    throw new AppError(401, "unauthorized", "Missing or invalid Authorization: Bearer <FINANCIAL_RAILS_KEY> header");
  }

  await next();
};
