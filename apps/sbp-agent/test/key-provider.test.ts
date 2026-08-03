import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAgentWalletKey } from "../src/key-provider.js";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-secrets-manager", () => {
  return {
    SecretsManagerClient: vi.fn().mockImplementation(() => ({ send: sendMock })),
    GetSecretValueCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
  };
});

const ENV_KEYS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SECRET_NAME", "AWS_REGION", "AGENT_WALLET_KEY"] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  sendMock.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("getAgentWalletKey — env var fallback (no AWS credentials)", () => {
  it("returns AGENT_WALLET_KEY from the environment", async () => {
    process.env.AGENT_WALLET_KEY = "fake-base64-key";
    await expect(getAgentWalletKey()).resolves.toBe("fake-base64-key");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("throws when neither AWS credentials nor AGENT_WALLET_KEY are set", async () => {
    await expect(getAgentWalletKey()).rejects.toThrow(/AGENT_WALLET_KEY not found/);
  });
});

describe("getAgentWalletKey — AWS Secrets Manager", () => {
  it("fetches and parses AGENT_WALLET_KEY from the secret JSON", async () => {
    process.env.AWS_ACCESS_KEY_ID = "fake-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "fake-secret-key";
    sendMock.mockResolvedValueOnce({ SecretString: JSON.stringify({ AGENT_WALLET_KEY: "from-aws-base64" }) });
    await expect(getAgentWalletKey()).resolves.toBe("from-aws-base64");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the secret has no SecretString", async () => {
    process.env.AWS_ACCESS_KEY_ID = "fake-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "fake-secret-key";
    sendMock.mockResolvedValueOnce({});
    await expect(getAgentWalletKey()).rejects.toThrow(/empty secret/);
  });

  it("throws when the secret JSON is missing the AGENT_WALLET_KEY field", async () => {
    process.env.AWS_ACCESS_KEY_ID = "fake-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "fake-secret-key";
    sendMock.mockResolvedValueOnce({ SecretString: JSON.stringify({ SOME_OTHER_FIELD: "x" }) });
    await expect(getAgentWalletKey()).rejects.toThrow(/missing AGENT_WALLET_KEY field/);
  });

  it("does not fall back to AGENT_WALLET_KEY env var when AWS credentials are present but the fetch fails", async () => {
    process.env.AWS_ACCESS_KEY_ID = "fake-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "fake-secret-key";
    process.env.AGENT_WALLET_KEY = "should-not-be-used";
    sendMock.mockRejectedValueOnce(new Error("AccessDeniedException"));
    await expect(getAgentWalletKey()).rejects.toThrow(/AccessDeniedException/);
  });
});
