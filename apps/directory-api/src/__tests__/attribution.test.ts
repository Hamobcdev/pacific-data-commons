import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import { attributionRoute } from "../routes/attribution.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { createFakeSupabase } from "./testUtils.js";
import { buildAttributionSignedMessage, encodeAlgorandAddress } from "../lib/algorandAttestation.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

/** Same pattern as freeRoutes.test.ts's buildTestApp — no payment gate, this is a free route. */
function buildTestApp(supabase: ReturnType<typeof createFakeSupabase>) {
  const app = new Hono<AppBindings>();
  const env = { ALGORAND_NETWORK: "testnet" } as Env;

  app.use("*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("env", env);
    await next();
  });

  app.route("/", attributionRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

/** Builds a real Ed25519 keypair, a real Algorand address from it, and a
 * genuinely valid signature over the attribution message — so the "happy
 * path" and "tampered signature" tests exercise the actual verification
 * logic in lib/algorandAttestation.ts, not a mock of it. */
function makeSignedPayload() {
  const keyPair = nacl.sign.keyPair();
  const wallet = encodeAlgorandAddress(keyPair.publicKey);
  const agentId = randomUUID();
  const runId = randomUUID();
  const nonce = "n".repeat(16);
  const timestamp = new Date().toISOString();
  const message = buildAttributionSignedMessage({ runId, agentId, nonce, timestamp });
  const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(message), keyPair.secretKey)).toString(
    "base64",
  );

  return {
    body: {
      run_id: runId,
      agent_id: agentId,
      endpoint_tx_ids: ["A".repeat(52)],
      originating_user_wallet_hash: "b".repeat(64),
      signed_by: wallet,
      signature,
      nonce,
      timestamp,
    },
    wallet,
    agentId,
  };
}

function postAttribution(app: Hono<AppBindings>, body?: unknown) {
  return app.request("/agent/attribution", {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /agent/attribution", () => {
  it("returns 400 when the request body is missing", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await postAttribution(app);
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await postAttribution(app, { run_id: "not-a-uuid" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unregistered agent_id", async () => {
    const { body } = makeSignedPayload();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [] } }));
    const res = await postAttribution(app, body);
    expect(res.status).toBe(400);
  });

  it("returns 409 when the nonce has already been used by this wallet", async () => {
    const { body, wallet, agentId } = makeSignedPayload();
    const app = buildTestApp(
      createFakeSupabase({
        agents: { data: [{ id: agentId, operational_wallet: wallet }] },
        used_nonces: { data: [{ wallet, nonce: body.nonce }] },
      }),
    );
    const res = await postAttribution(app, body);
    expect(res.status).toBe(409);
  });

  it("returns 422 when the signature does not verify", async () => {
    const { body, wallet, agentId } = makeSignedPayload();
    const tampered = { ...body, signature: Buffer.from(new Uint8Array(64)).toString("base64") };
    const app = buildTestApp(
      createFakeSupabase({
        agents: { data: [{ id: agentId, operational_wallet: wallet }] },
        used_nonces: { data: [] },
        agent_run_endpoints: { data: [] },
      }),
    );
    const res = await postAttribution(app, tampered);
    expect(res.status).toBe(422);
  });

  it("returns 404 for GET (wrong method)", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/agent/attribution");
    expect(res.status).toBe(404);
  });

  it("returns 201 for a valid, correctly signed payload", async () => {
    const { body, wallet, agentId } = makeSignedPayload();
    const app = buildTestApp(
      createFakeSupabase({
        agents: { data: [{ id: agentId, operational_wallet: wallet }] },
        used_nonces: { data: [] },
        agent_run_endpoints: { data: [] },
      }),
    );
    const res = await postAttribution(app, body);
    expect(res.status).toBe(201);
    const responseBody = (await res.json()) as { attribution: { run_id: string; attribution_status: string } };
    expect(responseBody.attribution.run_id).toBe(body.run_id);
    expect(responseBody.attribution.attribution_status).toBe("pending");
  });
});
