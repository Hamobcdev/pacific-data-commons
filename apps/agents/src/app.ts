import { Hono } from "hono";
import { z } from "zod";
import type { AgentInput } from "@pdc/shared-types";
import type { Env } from "./types/env.js";
import type { AppBindings } from "./types.js";
import { AppError, ValidationError } from "./lib/errors.js";
import { WalletRateLimiter } from "./lib/rateLimiter.js";
import { AGENT_REGISTRY, findAgentEntry, type AgentSlug } from "./agents/registry.js";
import { InsufficientDataError, SovereigntyBlockedError, type RunnableAgent } from "./agents/base.js";
import { calculateAgentQuote } from "./lib/quote.js";
import { quoteStore } from "./lib/quoteStore.js";
import { verifyOnChainPayment } from "./lib/paymentVerification.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandlerMiddleware } from "./middleware/error-handler.js";

const quoteRequestSchema = z.object({
  parameters: z.record(z.string()).default({}),
  user_wallet: z.string().min(1, "user_wallet is required"),
});

const executeRequestSchema = z.object({
  quote_id: z.string().uuid("quote_id must be a valid UUID"),
  tx_id: z.string().min(1, "tx_id is required"),
});

/** Wraps the same InsufficientDataError/SovereigntyBlockedError mapping the
 * existing POST /agents/:type route uses (below) — quote and execute both
 * call agent.run() under the hood and must fail the same way it does. */
function mapAgentRunError(err: unknown): never {
  if (err instanceof InsufficientDataError) {
    throw new AppError(422, "insufficient_data", err.message);
  }
  if (err instanceof SovereigntyBlockedError) {
    throw new AppError(403, "sovereignty_blocked", err.message);
  }
  throw err;
}

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
  // Session 13 — separate hourly windows for the user-facing quote/execute
  // pair, distinct from the per-minute limiter above that already guards
  // the direct POST /agents/:type route.
  const quoteRateLimiter = new WalletRateLimiter(3_600_000, env.MAX_QUOTES_PER_HOUR);
  const executeRateLimiter = new WalletRateLimiter(3_600_000, env.MAX_EXECUTIONS_PER_HOUR);
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

      // Session 16 — gate free execution. dry_run:true stays open: it never
      // pays a PDC endpoint or runs synthesis (see BaseAgent.run()'s
      // dry_run branch), so it carries no cost and AgentRunForm's preview
      // step depends on it staying free. dry_run:false used to run the full
      // paid pipeline — endpoint payment, synthesis, attribution — without
      // ever collecting the user's payment. That path now requires the
      // Session 13 quote-then-pay flow instead of this direct route.
      if (!body.dry_run) {
        throw new AppError(
          402,
          "payment_required",
          `Live execution requires payment. Call POST /agents/${entry.slug}/quote to get a quote, then POST /agents/${entry.slug}/execute with a confirmed on-chain payment.`,
        );
      }

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

  // Session 13 — the user-pays-agent leg. See lib/quote.ts and
  // lib/paymentVerification.ts's doc comments for why this is a plain
  // on-chain USDC transfer verified server-side, not x402: every x402
  // client path in this monorepo signs with a raw private key held
  // server-side, which a real browser wallet extension (Pera/Lute) can't
  // supply — those wallets sign via their own connect API and never expose
  // a raw key to the page.
  app.post("/agents/:agentId/quote", async (c) => {
    const entry = findAgentEntry(c.req.param("agentId"));
    if (!entry) {
      throw new AppError(404, "agent_not_found", `No agent registered at "${c.req.param("agentId")}"`);
    }

    const rawBody: unknown = await c.req.json().catch(() => undefined);
    const parsed = quoteRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid request body — ${parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ")}`,
      );
    }
    const body = parsed.data;

    const rateResult = quoteRateLimiter.check(body.user_wallet);
    if (!rateResult.allowed) {
      c.header("Retry-After", String(rateResult.retryAfterSeconds));
      throw new AppError(429, "rate_limited", "Too many quote requests for this wallet. Please slow down.");
    }

    const agent = agentInstances.get(entry.slug);
    if (!agent) {
      throw new AppError(503, "agent_not_registered", `"${entry.name}" has not been registered yet.`);
    }

    try {
      const quote = await calculateAgentQuote(agent, entry, body.parameters, body.user_wallet);
      return c.json(quote, 200);
    } catch (err) {
      mapAgentRunError(err);
    }
  });

  app.post("/agents/:agentId/execute", async (c) => {
    const entry = findAgentEntry(c.req.param("agentId"));
    if (!entry) {
      throw new AppError(404, "agent_not_found", `No agent registered at "${c.req.param("agentId")}"`);
    }

    const rawBody: unknown = await c.req.json().catch(() => undefined);
    const parsed = executeRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid request body — ${parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ")}`,
      );
    }
    const body = parsed.data;

    const quote = quoteStore.get(body.quote_id);
    if (!quote) {
      throw new AppError(404, "quote_not_found", "This quote does not exist or has expired. Please request a new quote.");
    }
    if (quote.agent_slug !== entry.slug) {
      throw new AppError(400, "quote_agent_mismatch", "This quote was issued for a different agent.");
    }
    if (quote.used) {
      throw new AppError(409, "quote_already_used", "This quote has already been redeemed.");
    }
    if (new Date(quote.quote_expires_at).getTime() < Date.now()) {
      throw new AppError(410, "quote_expired", "This quote has expired. Please request a new quote.");
    }

    const rateResult = executeRateLimiter.check(quote.user_wallet);
    if (!rateResult.allowed) {
      c.header("Retry-After", String(rateResult.retryAfterSeconds));
      throw new AppError(429, "rate_limited", "Too many agent executions for this wallet. Please slow down.");
    }

    const verification = await verifyOnChainPayment({
      txId: body.tx_id,
      quote,
      network: env.ALGORAND_NETWORK,
      algodUrl: env.ALGORAND_NODE_URL,
      indexerUrl: env.ALGORAND_INDEXER_URL,
    });
    if (!verification.ok) {
      throw new AppError(402, "payment_not_verified", verification.reason ?? "Payment could not be verified.");
    }

    // Marked used before execution (not after) so a second concurrent
    // request against the same quote_id+tx_id can't also pass — see
    // quoteStore.markUsed's own doc comment.
    quoteStore.markUsed(quote.quote_id);

    const agent = agentInstances.get(entry.slug);
    if (!agent) {
      throw new AppError(503, "agent_not_registered", `"${entry.name}" has not been registered yet.`);
    }

    const input: AgentInput = {
      agent_type: entry.agentType,
      parameters: quote.parameters,
      user_wallet: quote.user_wallet,
      output_language: "en",
      dry_run: false,
    };

    try {
      const output = await agent.run(input);
      return c.json(output, 201);
    } catch (err) {
      mapAgentRunError(err);
    }
  });

  app.notFound((c) =>
    c.json(
      {
        error: "not_found",
        message: "Route not found",
        available_routes: [
          "/health",
          "/agents",
          "/agents/:type",
          "/agents/:agentId/quote",
          "/agents/:agentId/execute",
          ...AGENT_REGISTRY.map((e) => `POST /agents/${e.slug}`),
        ],
      },
      404,
    ),
  );

  app.onError(errorHandlerMiddleware);

  return app;
}
