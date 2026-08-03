import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

/**
 * AWS Secrets Manager key provider (Session 8, Priority 1 — the August 3
 * seed-phrase exposure that drove the wallet migration). AGENT_WALLET_KEY
 * previously lived in Doppler and Railway variables indefinitely; a private
 * key sitting in application config is exactly the exposure surface that
 * incident came from. This retrieves it from AWS Secrets Manager at the
 * start of each signing operation instead, and returns it to the caller
 * without persisting it anywhere beyond that call's local variables — the
 * module itself caches nothing but the AWS SDK client object.
 *
 * Falls back to the AGENT_WALLET_KEY env var when AWS credentials aren't
 * present, so local development keeps working without an AWS account.
 */
const AWS_SECRET_NAME = process.env.AWS_SECRET_NAME ?? "pdc/agent-wallet-key";
const AWS_REGION = process.env.AWS_REGION ?? "ap-southeast-1";

let secretsClient: SecretsManagerClient | null = null;

function getSecretsClient(): SecretsManagerClient {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({ region: AWS_REGION });
  }
  return secretsClient;
}

/**
 * Retrieves the Base64-encoded agent wallet key (R9 — never a mnemonic, never
 * hex). Uses AWS Secrets Manager when AWS credentials are configured,
 * otherwise falls back to the AGENT_WALLET_KEY env var. Throws if neither
 * source has a key — callers that treat a missing key as "run in dry-run
 * mode" (apps/sbp-agent/src/index.ts) must catch this, not let it propagate.
 */
export async function getAgentWalletKey(): Promise<string> {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    const client = getSecretsClient();
    const command = new GetSecretValueCommand({ SecretId: AWS_SECRET_NAME });
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error("AWS Secrets Manager returned empty secret for agent wallet key");
    }

    // Secret stored as JSON: { "AGENT_WALLET_KEY": "base64..." }
    const secret = JSON.parse(response.SecretString) as Record<string, unknown>;
    if (typeof secret.AGENT_WALLET_KEY !== "string" || secret.AGENT_WALLET_KEY.length === 0) {
      throw new Error("AWS secret missing AGENT_WALLET_KEY field");
    }

    return secret.AGENT_WALLET_KEY;
  }

  const key = process.env.AGENT_WALLET_KEY;
  if (!key) {
    throw new Error("AGENT_WALLET_KEY not found in AWS Secrets Manager or environment");
  }

  return key;
}
