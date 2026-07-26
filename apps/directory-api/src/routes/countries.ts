import { Hono } from "hono";
import { AppError } from "../lib/errors.js";
import type { AppBindings } from "../types.js";

export const countriesRoute = new Hono<AppBindings>();

countriesRoute.get("/countries", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase.from("providers").select("country").eq("is_active", true);

  if (error) {
    throw new AppError(502, "database_error", `Countries lookup failed: ${error.message}`);
  }

  const countries = Array.from(new Set((data ?? []).map((row) => row.country as string))).sort();
  return c.json({ countries });
});
