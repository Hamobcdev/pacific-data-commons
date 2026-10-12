"""
PDQE Stage 11 — x402 canary payment helper (shared by the auto-canary hook and
the operator canary script).

Python cannot import pdc-x402-adapter (a TypeScript library), and nothing in
Python may talk to @x402/* directly. So one payment = one short TypeScript
program, run with tsx from a directory where the pnpm workspace resolves
@pdc/x402-adapter. That program uses only the adapter's exports
(createManualPaymentFetch, decodeSettlementFromResponse,
getManualPaymentAddress).

Before signing, the helper re-reads the live 402 challenge and refuses if:
  * the amount asked exceeds job.maxAtomic (caller passes listed price + 10%);
  * the network is not the expected CAIP-2 id;
  * the payTo is the payer itself (self-payment).

The payer's mnemonic is read from the CANARY_WALLET_MNEMONIC environment
variable inside the helper process only. It is never passed on the command
line, never written to the temporary file and never echoed back.

Deliberately has no imports from the rest of app/ so the standalone operator
script can import it without the pipeline's dependencies.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from decimal import ROUND_DOWN, Decimal
from pathlib import Path

MNEMONIC_ENV = "CANARY_WALLET_MNEMONIC"
USDC_ATOMIC_PER_UNIT = Decimal(10) ** 6
PRICE_TOLERANCE = Decimal("1.10")
HELPER_TIMEOUT_SECONDS = 90

CAIP2 = {
    "mainnet": "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
    "testnet": "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
}

# apps/pdqe-pipeline/app/integration/ → repo root is four levels up. The
# directory-api test folder already holds adapter-based payment tooling and
# resolves @pdc/x402-adapter, algosdk and tsx from the workspace.
DEFAULT_HELPER_DIR = Path(__file__).resolve().parents[4] / "apps" / "directory-api" / "test"

HELPER_TS = r"""
import algosdk from "algosdk";
import { createManualPaymentFetch, decodeSettlementFromResponse, getManualPaymentAddress } from "@pdc/x402-adapter";

interface Job { url: string; maxAtomic: string; network: "mainnet" | "testnet"; caip2: string; expectedPayer: string; inspectOnly: boolean }

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

function out(result: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(result) + "\n");
}

async function main(): Promise<void> {
  const job = JSON.parse(await readStdin()) as Job;

  const unpaid = await fetch(job.url, { redirect: "manual" });
  if (unpaid.status !== 402) return out({ outcome: "not_x402_gated", http_status: unpaid.status });
  const header = unpaid.headers.get("payment-required");
  if (!header) return out({ outcome: "no_payment_required_header", http_status: 402 });
  const required = JSON.parse(Buffer.from(header, "base64").toString("utf-8")) as {
    accepts?: { amount: string; network: string; payTo: string; asset: string }[];
  };
  const accepts = required.accepts ?? [];
  if (accepts.length !== 1) return out({ outcome: "unexpected_accepts", accepts_count: accepts.length });
  const a = accepts[0];
  const quote = { amount_atomic: a.amount, max_atomic: job.maxAtomic, network: a.network, pay_to: a.payTo, asset: a.asset };

  if (!/^\d+$/.test(a.amount) || BigInt(a.amount) > BigInt(job.maxAtomic)) {
    return out({ outcome: "refused_price_mismatch", ...quote });
  }
  if (a.network !== job.caip2) return out({ outcome: "refused_wrong_network", ...quote });
  if (a.payTo === job.expectedPayer) return out({ outcome: "refused_self_payment", ...quote });
  if (job.inspectOnly) return out({ outcome: "would_pay", ...quote });

  const mnemonic = process.env.CANARY_WALLET_MNEMONIC;
  if (!mnemonic) return out({ outcome: "error", error: "CANARY_WALLET_MNEMONIC not set", ...quote });
  const privateKeyBase64 = Buffer.from(algosdk.mnemonicToSecretKey(mnemonic.trim()).sk).toString("base64");
  if (getManualPaymentAddress(privateKeyBase64) !== job.expectedPayer) {
    return out({ outcome: "error", error: "CANARY_WALLET_MNEMONIC does not derive to CANARY_WALLET_ADDRESS", ...quote });
  }

  const payingFetch = createManualPaymentFetch({ privateKeyBase64, network: job.network });
  const paid = await payingFetch(job.url);
  const settlement = decodeSettlementFromResponse(paid);
  out({
    outcome: paid.ok && settlement ? "settled" : "not_settled",
    http_status: paid.status,
    algo_tx_id: settlement?.algoTxId ?? null,
    settled_payer: settlement?.payerAddress ?? null,
    ...quote,
  });
}

main().catch((e: unknown) => out({ outcome: "error", error: e instanceof Error ? e.message : String(e) }));
"""


def max_atomic_for(listed_price_usdc: Decimal) -> int:
    """Listed price + 10%, in atomic USDC, rounded down."""
    return int((Decimal(listed_price_usdc) * PRICE_TOLERANCE * USDC_ATOMIC_PER_UNIT).to_integral_value(ROUND_DOWN))


def run_helper(job: dict, helper_dir: Path = DEFAULT_HELPER_DIR) -> dict:
    """
    Run one helper job and return its JSON result. Never raises: every failure
    comes back as {"outcome": "helper_unavailable" | "error", ...}.

    The temporary .mts file is always removed, whatever happens.
    """
    if not helper_dir.is_dir() or shutil.which("npx") is None:
        return {"outcome": "helper_unavailable", "error": f"needs npx and the pnpm workspace at {helper_dir}"}

    helper = helper_dir / f".canary-helper-{uuid.uuid4().hex}.mts"
    try:
        helper.write_text(HELPER_TS, encoding="utf-8")
        proc = subprocess.run(
            ["npx", "--no-install", "tsx", str(helper)],
            input=json.dumps(job),
            capture_output=True,
            text=True,
            cwd=helper_dir.parent,
            timeout=HELPER_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return {"outcome": "error", "error": f"helper timed out after {HELPER_TIMEOUT_SECONDS}s"}
    except OSError as exc:
        return {"outcome": "helper_unavailable", "error": str(exc)}
    finally:
        helper.unlink(missing_ok=True)

    lines = proc.stdout.strip().splitlines()
    try:
        result = json.loads(lines[-1]) if lines else None
    except json.JSONDecodeError:
        result = None
    if not isinstance(result, dict) or "outcome" not in result:
        return {"outcome": "error", "error": f"helper exit {proc.returncode}: {proc.stderr.strip()[-500:]}"}
    return result
