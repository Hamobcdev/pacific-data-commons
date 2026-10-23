import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { logoRoute } from "../routes/logo.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });

  app.route("/", logoRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /logo.png", () => {
  it("returns 200, image/png, a day-long Cache-Control, and the real logo's exact bytes", async () => {
    const app = buildTestApp();
    const res = await app.request("/logo.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");

    const body = new Uint8Array(await res.arrayBuffer());
    const sourcePath = fileURLToPath(new URL("../../public/images/sbp-logo.png", import.meta.url));
    const expected = new Uint8Array(readFileSync(sourcePath));
    expect(body.length).toBe(expected.length);
    expect(Buffer.from(body).equals(Buffer.from(expected))).toBe(true);
  });
});
