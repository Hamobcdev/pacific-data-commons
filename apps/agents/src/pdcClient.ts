import {
  createManualPaymentFetch,
  decodeSettlementFromResponse,
  getManualPaymentAddress,
  type PdcAlgorandNetwork,
} from "@pdc/x402-adapter";

export interface PdcClientConfig {
  /** Base64-encoded 64-byte Algorand private key for the agent's operational wallet. */
  operationalWalletKey: string;
  network: PdcAlgorandNetwork;
}

export interface PdcQueryResult<T> {
  data: T;
  /** Settled Algorand transaction id, or null if the response carried no PAYMENT-RESPONSE header. */
  txId: string | null;
  payerAddress: string | null;
}

/**
 * Client-side x402 payment wrapper for PDC marketplace agents (CLAUDE.md
 * Section 19). Every paid request an agent makes against the directory API
 * or a provider endpoint goes through here.
 *
 * This delegates entirely to @pdc/x402-adapter's createManualPaymentFetch,
 * which itself wraps @x402/fetch's wrapFetchWithPayment with a
 * @x402/avm toClientAvmSigner — the official Algorand x402 tutorial's
 * 402 -> sign -> retry flow (dev.algorand.co/resources/x402-on-algorand),
 * GoPlausible-facilitator compatible. No agent module imports @x402/fetch or
 * @x402/avm directly: CLAUDE.md Section 17/18 restricts all @x402/* imports
 * to pdc-x402-adapter, and that restriction covers agent wallets exactly the
 * same way it covers apps/sbp-agent's dogfooding agent.
 *
 * Use the `fromWalletKey` factory in production. The plain constructor takes
 * an already-built payingFetch so tests can inject a fake without signing a
 * real transaction.
 */
export class PdcClient {
  constructor(
    readonly address: string,
    private readonly payingFetch: typeof fetch,
  ) {}

  static fromWalletKey(config: PdcClientConfig): PdcClient {
    const address = getManualPaymentAddress(config.operationalWalletKey);
    const payingFetch = createManualPaymentFetch({
      privateKeyBase64: config.operationalWalletKey,
      network: config.network,
    });
    return new PdcClient(address, payingFetch);
  }

  /**
   * Issues a paid GET against any x402-gated PDC URL — a directory /search
   * call or a provider endpoint route — and decodes the settlement off the
   * response. Throws on a non-2xx response; callers decide how to log or
   * recover (matching apps/sbp-agent/src/agent.ts's per-call try/catch
   * style, since a failed query is a normal, expected outcome for a
   * scheduled agent, not a crash).
   */
  async get<T = unknown>(url: string): Promise<PdcQueryResult<T>> {
    const res = await this.payingFetch(url);
    if (!res.ok) {
      throw new Error(`PDC request to ${url} returned HTTP ${res.status}`);
    }
    const data = (await res.json()) as T;
    const settlement = decodeSettlementFromResponse(res);
    return {
      data,
      txId: settlement?.algoTxId ?? null,
      payerAddress: settlement?.payerAddress ?? null,
    };
  }
}
