import { Hono } from "hono";
import { getPublicEndpointDetail } from "../services/endpointService.js";
import { ValidationError } from "../lib/errors.js";
import type { AppBindings } from "../types.js";

export const endpointRoute = new Hono<AppBindings>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

endpointRoute.get("/endpoint/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    throw new ValidationError(`"${id}" is not a valid endpoint id`);
  }

  const supabase = c.get("supabase");
  const endpoint = await getPublicEndpointDetail(supabase, id);
  return c.json({ endpoint });
});
