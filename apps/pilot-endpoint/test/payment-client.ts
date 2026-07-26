/**
 * Manual payment test client for the PDC pilot endpoint. NOT a test runner
 * file — vitest does not pick this up (it isn't a *.test.ts). Run it by hand
 * after deployment to verify the full end-to-end payment flow.
 *
 * Prerequisites:
 * - Pilot endpoint deployed and running (TEST_ENDPOINT_URL set, or defaults
 *   to http://localhost:4021)
 * - An Algorand account (Testnet or Mainnet, matching the deployed
 *   endpoint's ALGORAND_NETWORK) opted in to USDC, holding some USDC and ALGO
 * - That account's Base64-encoded private key in TEST_PRIVATE_KEY
 *
 * Run: npx tsx test/payment-client.ts
 *
 * What it checks:
 * 1. Free routes return correct data without payment
 * 2. Paid routes return 402 without a payment header
 * 3. Full x402 payment flow: sign -> submit -> verify -> receive data
 * 4. The canonical hash in a paid response matches /integrity
 * 5. The PDP v1.0 envelope is present and correctly structured
 *
 * This deliberately goes through @pdc/x402-adapter's createManualPaymentFetch
 * rather than importing @x402/fetch or @x402/avm here — the "never import
 * @x402/* outside the adapter" rule applies to test tooling too (R1).
 */
import { createManualPaymentFetch, type PdcAlgorandNetwork } from "@pdc/x402-adapter";

const BASE_URL = process.env.TEST_ENDPOINT_URL ?? "http://localhost:4021";
const PRIVATE_KEY = process.env.TEST_PRIVATE_KEY;
const NETWORK = (process.env.TEST_NETWORK as PdcAlgorandNetwork | undefined) ?? "mainnet";

interface HealthBody {
  dataset: { canonical_hash: string };
}

interface IntegrityBody {
  hash: string;
}

interface PaidBody {
  schema_version?: string;
  paid_tier?: string;
  data_warning?: string;
  provider?: { provenance_hash?: string };
}

function mark(ok: boolean): string {
  return ok ? "✓" : "✗";
}

async function runTests(): Promise<void> {
  console.log(`\nPDC Pilot Endpoint Payment Test`);
  console.log(`Target: ${BASE_URL}\n`);

  console.log("1. Testing free routes...");
  const health = await fetch(`${BASE_URL}/health`);
  const healthData = (await health.json()) as HealthBody;
  console.log(`   /health: ${health.status} ${mark(health.ok)}`);

  const integrity = await fetch(`${BASE_URL}/integrity`);
  const integrityData = (await integrity.json()) as IntegrityBody;
  console.log(`   /integrity: ${integrity.status} — hash: ${integrityData.hash?.slice(0, 16)}... ${mark(integrity.ok)}`);

  console.log("\n2. Testing 402 enforcement...");
  const unpaid = await fetch(`${BASE_URL}/summary`);
  console.log(`   /summary without payment: ${unpaid.status} ${mark(unpaid.status === 402)}`);

  if (!PRIVATE_KEY) {
    console.log("\n3. Skipping payment test — TEST_PRIVATE_KEY not set");
    console.log("   Set TEST_PRIVATE_KEY to test the full payment flow");
    return;
  }

  console.log("\n3. Testing full x402 payment flow...");
  const payingFetch = createManualPaymentFetch({ privateKeyBase64: PRIVATE_KEY, network: NETWORK });

  const paid = await payingFetch(`${BASE_URL}/summary`);
  const paidData = (await paid.json()) as PaidBody;

  console.log(`   /summary with payment: ${paid.status} ${mark(paid.ok)}`);
  console.log(`   schema_version: ${paidData.schema_version} ${mark(paidData.schema_version === "pdp-1.0")}`);
  console.log(`   paid_tier: ${paidData.paid_tier} ${mark(paidData.paid_tier === "summary")}`);
  console.log(`   data_warning present: ${mark(!!paidData.data_warning)}`);

  console.log("\n4. Verifying hash integrity...");
  const responseHash = paidData.provider?.provenance_hash;
  const hashMatch = responseHash === integrityData.hash && responseHash === healthData.dataset.canonical_hash;
  console.log(`   Response hash matches /integrity and /health: ${mark(hashMatch)}`);

  console.log("\n── Test complete ──\n");
}

runTests().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
