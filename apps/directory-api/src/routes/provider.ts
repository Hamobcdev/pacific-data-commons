import { Hono } from "hono";
import { getPublicProviderProfile } from "../services/providerService.js";
import { ValidationError } from "../lib/errors.js";
import type { AppBindings } from "../types.js";

export const providerRoute = new Hono<AppBindings>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

providerRoute.get("/provider/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    throw new ValidationError(`"${id}" is not a valid provider id`);
  }

  const supabase = c.get("supabase");
  const profile = await getPublicProviderProfile(supabase, id);
  return c.json(profile);
});
