import { Hono } from "hono";
import type { AppBindings } from "../types.js";

export const healthRoute = new Hono<AppBindings>();

healthRoute.get("/health", async (c) => {
  const supabase = c.get("supabase");
  const startedAt = Date.now();
  const { error } = await supabase.from("providers").select("id", { head: true, count: "exact" }).limit(1);

  const dbOk = !error;
  return c.json(
    {
      status: dbOk ? "ok" : "degraded",
      service: "pdc-directory-api",
      network: c.get("env").ALGORAND_NETWORK,
      database: dbOk ? "reachable" : "unreachable",
      responseTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    dbOk ? 200 : 503,
  );
});
