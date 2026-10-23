import { Hono } from "hono";
import { getLogoPngBytes } from "../lib/logoAsset.js";
import type { AppBindings } from "../types.js";

/**
 * GET /logo.png — GoPlausible listing requirement. See logoAsset.ts's doc
 * comment for why this is a Hono route embedding the real logo's bytes
 * rather than a second file under ./public (Cloudflare's native [assets]
 * binding already serves apps/directory-api/public/images/sbp-logo.png for
 * og:image — see branding.ts — but that mechanism is Workers-production-
 * only and invisible to this app's local tsx dev script).
 */
export const logoRoute = new Hono<AppBindings>();

logoRoute.get("/logo.png", () => {
  // Plain Response (not c.body()) — Hono's typed c.body() overload wants
  // Uint8Array<ArrayBuffer> specifically; @cloudflare/workers-types widens
  // the global Uint8Array to Uint8Array<ArrayBufferLike>, so c.body()
  // doesn't accept it here. Response's BodyInit isn't constrained the
  // same way.
  return new Response(getLogoPngBytes(), {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
});
