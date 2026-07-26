import { Hono } from "hono";
import { verifyCertificateByHash } from "../services/verifyService.js";
import { ValidationError } from "../lib/errors.js";
import type { AppBindings } from "../types.js";

export const verifyRoute = new Hono<AppBindings>();

const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;

verifyRoute.get("/verify/:certHash", async (c) => {
  const certHash = c.req.param("certHash");
  if (!SHA256_HEX_RE.test(certHash)) {
    throw new ValidationError("cert_hash must be a 64-character hex SHA-256 digest");
  }

  const supabase = c.get("supabase");
  const verification = await verifyCertificateByHash(supabase, certHash);
  return c.json({ verification });
});
