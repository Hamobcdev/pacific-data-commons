import { Hono } from "hono";
import { DATA_CATEGORIES } from "../lib/dataCategories.js";
import type { AppBindings } from "../types.js";

export const categoriesRoute = new Hono<AppBindings>();

categoriesRoute.get("/categories", (c) =>
  c.json({ categories: DATA_CATEGORIES.filter((category) => category !== "other") }),
);
