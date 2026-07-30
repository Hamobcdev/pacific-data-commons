import { Hono } from "hono";
import { z } from "zod";
import type { AgentInput } from "@pdc/shared-types";
import type { Env } from "./types/env.js";
import type { AppBindings } from "./types.js";
import { AppError, ValidationError } from "./lib/errors.js";
import { WalletRateLimiter } from "./lib/rateLimiter.js";
import { AGENT_REGISTRY, findAgentEntry, type AgentSlug } from "./agents/registry.js";
import { InsufficientDataError, SovereigntyBlockedError, type RunnableAgent } from "./agents/base.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandlerMiddleware } from "./middleware/error-handler.js";

const runRequestSchema = z.object({
  parameters: z.record(z.string()).default({}),
  dry_run: z.boolean().default(false),
  user_wallet: z.string().min(1, "user_wallet is required"),
  output_language: z.string().default("en"),
});

/**
 * Builds the full route wiring (Deliverable 6) given already-constructed
 * agent instances, separated from index.ts's `main()` so tests can build an
 * app against fake agent instances and a fake Env without calling loadEnv()
 * (which requires real secrets) or starting a real HTTP listener — same
 * "build the app, don't call serve()" split apps/directory-api's tests use.
 */
export function createApp(env: Env, agentInstances: Map<AgentSlug, RunnableAgent | null>): Hono<AppBindings> {
  const rateLimiter = new WalletRateLimiter(60_000, env.MAX_REQUESTS_PER_MINUTE);
  const app = new Hono<AppBindings>();

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });
  app.use("*", corsMiddleware);

  app.get("/health", (c) => c.json({ status: "ok", service: "pdc-agents", time: new Date().toISOString() }));

  app.get("/agents", (c) =>
    c.json({
      agents: AGENT_REGISTRY.map((entry) => ({
        id: entry.slug,
        agent_type: entry.agentType,
        name: entry.name,
        description: entry.description,
        categories: entry.categories,
        price_range_usdc: entry.priceRangeUsdc,
        registered: agentInstances.get(entry.slug) != null,
      })),
    }),
  );

  app.get("/agents/:type", (c) => {
    const type = c.req.param("type");
    const entry = findAgentEntry(type);
    if (!entry) {
      throw new AppError(404, "agent_not_found", `No agent registered at "${type}"`);
    }
    return c.json({
      id: entry.slug,
      agent_type: entry.agentType,
      name: entry.name,
      description: entry.description,
      categories: entry.categories,
      price_range_usdc: entry.priceRangeUsdc,
      parameters: entry.parameters,
      registered: agentInstances.get(entry.slug) != null,
    });
  });

  for (const entry of AGENT_REGISTRY) {
    app.post(`/agents/${entry.slug}`, async (c) => {
      const rawBody: unknown = await c.req.json().catch(() => undefined);
      const parsed = runRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        throw new ValidationError(
          `Invalid request body — ${parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ")}`,
        );
      }
      const body = parsed.data;

      // R4 — enforced structurally, not just documented: no agent may
      // produce non-English output at launch (Decision 33).
      if (body.output_language !== "en") {
        throw new ValidationError(
          `output_language "${body.output_language}" is not supported at launch — English only (Decision 33).`,
        );
      }

      const rateResult = rateLimiter.check(body.user_wallet);
      if (!rateResult.allowed) {
        c.header("Retry-After", String(rateResult.retryAfterSeconds));
        throw new AppError(429, "rate_limited", "Too many requests for this wallet. Please slow down.");
      }

      const agent = agentInstances.get(entry.slug);
      if (!agent) {
        throw new AppError(
          503,
          "agent_not_registered",
          `"${entry.name}" has not been registered yet — run scripts/register-agents.ts and set ${entry.slug.toUpperCase()}_AGENT_ID.`,
        );
      }

      const input: AgentInput = {
        agent_type: entry.agentType,
        parameters: body.parameters,
        user_wallet: body.user_wallet,
        output_language: body.output_language,
        dry_run: body.dry_run,
      };

      try {
        const output = await agent.run(input);
        return c.json(output, body.dry_run ? 200 : 201);
      } catch (err) {
        if (err instanceof InsufficientDataError) {
          throw new AppError(422, "insufficient_data", err.message);
        }
        if (err instanceof SovereigntyBlockedError) {
          throw new AppError(403, "sovereignty_blocked", err.message);
        }
        throw err;
      }
    });
  }

  app.notFound((c) =>
    c.json(
      {
        error: "not_found",
        message: "Route not found",
        available_routes: ["/health", "/agents", "/agents/:type", ...AGENT_REGISTRY.map((e) => `POST /agents/${e.slug}`)],
      },
      404,
    ),
  );

  app.onError(errorHandlerMiddleware);

  return app;
}
