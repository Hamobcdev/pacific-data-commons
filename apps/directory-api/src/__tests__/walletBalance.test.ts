import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { walletBalanceRoute } from "../routes/algorand/wallet-balance.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const NODELY_URL = "https://mainnet-api.4160.nodely.io";
const ALGONODE_URL = "https://mainnet-api.algonode.cloud";

// 58 valid base32 (A-Z2-7) characters.
const VALID_ADDRESS = "A".repeat(58);

function buildTestApp(envOverrides: Partial<Env> = {}) {
  const app = new Hono<AppBindings>();
  const env = { ALGORAND_NODE_URL: NODELY_URL, NODELY_API_TOKEN: undefined, ...envOverrides } as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });

  app.route("/", walletBalanceRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /algorand/wallet-balance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 when address is missing", async () => {
    const app = buildTestApp();
    const res = await app.request("/algorand/wallet-balance");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 for an address that is too short", async () => {
    const app = buildTestApp();
    const res = await app.request("/algorand/wallet-balance?address=TOOSHORT");
    expect(res.status).toBe(400);
  });

  it("returns 400 for an address with invalid characters", async () => {
    const app = buildTestApp();
    // 58 chars but contains '0' and '1', which aren't in the base32 alphabet A-Z2-7.
    const invalid = "0".repeat(58);
    const res = await app.request(`/algorand/wallet-balance?address=${invalid}`);
    expect(res.status).toBe(400);
  });

  it("returns 200 with balances on a valid address and a healthy primary node", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            amount: 12_500_000,
            status: "Online",
            "min-balance": 100_000,
            assets: [{ "asset-id": 31566704, amount: 100_250_000 }],
          }),
          { status: 200 },
        ),
      ),
    );

    const app = buildTestApp();
    const res = await app.request(`/algorand/wallet-balance?address=${VALID_ADDRESS}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      address: VALID_ADDRESS,
      exists: true,
      status: "Online",
      algo_balance: 12.5,
      usdc_balance: 100.25,
      usdc_opted_in: true,
      usdc_asset_id: 31566704,
      min_balance_algo: 0.1,
      network: "mainnet",
    });
    expect(body.source).toBeUndefined();
  });

  it("returns 200 with exists:false on a primary-node 404 (account never funded)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    const app = buildTestApp();
    const res = await app.request(`/algorand/wallet-balance?address=${VALID_ADDRESS}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { exists: boolean; algo_balance: number; source?: string };
    expect(body.exists).toBe(false);
    expect(body.algo_balance).toBe(0);
    // A confirmed 404 is a real answer — must not trigger the AlgoNode fallback.
    expect(body.source).toBeUndefined();
  });

  it("falls back to AlgoNode when the primary node errors, and tags the response with the fallback source", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith(NODELY_URL)) {
        throw new Error("network error");
      }
      expect(url.startsWith(ALGONODE_URL)).toBe(true);
      return new Response(
        JSON.stringify({ amount: 5_000_000, status: "Online", "min-balance": 100_000, assets: [] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = buildTestApp();
    const res = await app.request(`/algorand/wallet-balance?address=${VALID_ADDRESS}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { exists: boolean; algo_balance: number; source?: string; usdc_opted_in: boolean };
    expect(body.exists).toBe(true);
    expect(body.algo_balance).toBe(5);
    expect(body.usdc_opted_in).toBe(false);
    expect(body.source).toBe("algonode-fallback");
  });

  it("returns 503 when both the primary and fallback nodes are unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );

    const app = buildTestApp();
    const res = await app.request(`/algorand/wallet-balance?address=${VALID_ADDRESS}`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("node_unavailable");
  });
});
