/**
 * Manual x402 payment test client for GET /finance/samoa-cpi (Decisions 59/
 * 60, PR #65). NOT a test runner file — vitest does not pick this up.
 *
 * Two-phase by design, matching the safety gate the human operator asked
 * for: run with no arguments to ONLY inspect the live 402 response (no
 * payment, no risk) and print the payTo/amount/asset/network it demands —
 * confirm those match expectations before spending anything. Only re-run
 * with `--confirm` once that's been visually checked; that's the only
 * thing that authorises signing and submitting a real payment.
 *
 * Run (inspect only, safe, default):
 *   npx tsx test/payment-client.ts
 *
 * Run (real payment, after confirming the printed payTo):
 *   TEST_WALLET_MNEMONIC="<25-word mnemonic>" npx tsx test/payment-client.ts --confirm
 *
 * TEST_WALLET_MNEMONIC is read directly from the environment and used only
 * in-process to derive a signing key — never printed, logged, or written
 * anywhere by this script. Never put it in a file, a commit, or pass it as
 * a bare CLI argument (shell history / process list would then have it) —
 * environment variable only.
 *
 * This deliberately goes through @pdc/x402-adapter's createManualPaymentFetch
 * rather than importing @x402/fetch or @x402/avm here — the "never import
 * @x402/* outside the adapter" rule applies to test tooling too (R1).
 */
import algosdk from "algosdk";
import { createManualPaymentFetch, decodeSettlementFromResponse, getManualPaymentAddress, type PdcAlgorandNetwork } from "@pdc/x402-adapter";

const ENDPOINT_URL = process.env.TEST_ENDPOINT_URL ?? "https://api.synergybcpacific.com/finance/samoa-cpi";
const NETWORK = (process.env.TEST_NETWORK as PdcAlgorandNetwork | undefined) ?? "mainnet";
const CONFIRMED = process.argv.includes("--confirm");

interface X402Accept {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: { decimals?: number; tag?: string };
}

interface PaymentRequiredHeader {
  x402Version: number;
  resource: { url: string; description: string };
  accepts: X402Accept[];
}

function decodePaymentRequiredHeader(headerValue: string): PaymentRequiredHeader {
  return JSON.parse(Buffer.from(headerValue, "base64").toString("utf-8")) as PaymentRequiredHeader;
}

/** Base64-encoded 64-byte Algorand secret key (32-byte seed + 32-byte public key) — createManualPaymentFetch's expected format, derived from the 25-word mnemonic via algosdk's own conversion. */
function mnemonicToPrivateKeyBase64(mnemonic: string): string {
  const { sk } = algosdk.mnemonicToSecretKey(mnemonic.trim());
  return Buffer.from(sk).toString("base64");
}

async function main(): Promise<void> {
  console.log(`\nSamoa CPI x402 payment test`);
  console.log(`Target: ${ENDPOINT_URL}\n`);

  console.log("1. Requesting without payment (expect 402)...");
  const unpaid = await fetch(ENDPOINT_URL);
  console.log(`   Status: ${unpaid.status} ${unpaid.status === 402 ? "✓" : "✗ expected 402"}`);

  const headerValue = unpaid.headers.get("payment-required");
  if (!headerValue) {
    throw new Error("402 response had no payment-required header — cannot proceed, endpoint may not be x402-gated as expected");
  }
  const paymentRequired = decodePaymentRequiredHeader(headerValue);
  const accept = paymentRequired.accepts[0];
  if (!accept) {
    throw new Error("payment-required header had no accepts[] entries");
  }

  const decimals = accept.extra?.decimals ?? 6;
  const amountDecimal = Number(accept.amount) / 10 ** decimals;

  console.log("\n   Payment requirements from the live response:");
  console.log(`   payTo:   ${accept.payTo}`);
  console.log(`   amount:  ${accept.amount} atomic units = $${amountDecimal} (asset ${accept.asset})`);
  console.log(`   network: ${accept.network}`);
  console.log(`   scheme:  ${accept.scheme}`);

  if (!CONFIRMED) {
    console.log("\n── Inspection only — no payment sent. ──");
    console.log("Visually confirm payTo above matches the expected pilot-earnings wallet,");
    console.log("then re-run with TEST_WALLET_MNEMONIC set and --confirm to actually pay.\n");
    return;
  }

  console.log("\n2. --confirm passed — proceeding to sign and submit a real payment.");
  const mnemonic = process.env.TEST_WALLET_MNEMONIC;
  if (!mnemonic) {
    throw new Error("--confirm was passed but TEST_WALLET_MNEMONIC is not set — refusing to guess or fabricate a signing key");
  }

  const privateKeyBase64 = mnemonicToPrivateKeyBase64(mnemonic);
  const payerAddress = getManualPaymentAddress(privateKeyBase64);
  console.log(`   Payer address (derived from TEST_WALLET_MNEMONIC): ${payerAddress}`);

  const payingFetch = createManualPaymentFetch({ privateKeyBase64, network: NETWORK });

  console.log("\n3. Submitting payment via the GoPlausible facilitator and retrying with X-PAYMENT...");
  const paid = await payingFetch(ENDPOINT_URL);
  console.log(`   Status: ${paid.status} ${paid.ok ? "✓" : "✗"}`);

  const settlement = decodeSettlementFromResponse(paid);

  console.log("\n4. Final response:");
  const body = (await paid.json()) as unknown;
  console.log(JSON.stringify(body, null, 2));

  console.log("\n── Settlement ──");
  if (settlement) {
    console.log(`   Transaction ID: ${settlement.algoTxId}`);
    console.log(`   Payer address:  ${settlement.payerAddress ?? "(not present in response)"}`);
  } else {
    console.log("   No PAYMENT-RESPONSE header found on the response — settlement could not be decoded.");
  }
  console.log();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
