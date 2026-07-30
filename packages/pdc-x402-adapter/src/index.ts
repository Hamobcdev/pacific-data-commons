/**
 * pdc-x402-adapter
 *
 * The ONLY module in this monorepo allowed to import @x402/* packages
 * (CLAUDE.md v2.1, Section 6 stack table + Section 17/18 "always via
 * pdc-x402-adapter" rule). Every app that needs to gate a route behind an
 * x402 payment, or read back what a settled payment paid, goes through the
 * exports below instead of touching @x402/hono, @x402/avm or @x402/core.
 *
 * Pinned to @x402/* 2.19.x — bump the pin here, once, when upgrading.
 */
import { paymentMiddleware } from "@x402/hono";
import {
  x402ResourceServer,
  HTTPFacilitatorClient,
  type RouteConfig,
  type RoutesConfig,
} from "@x402/core/server";
import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { Network } from "@x402/core/types";
import {
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_TESTNET_CAIP2,
  convertFromTokenAmount,
  toClientAvmSigner,
  USDC_DECIMALS,
} from "@x402/avm";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { ExactAvmScheme as ExactAvmClientScheme } from "@x402/avm/exact/client";
import type { MiddlewareHandler } from "hono";

export type PdcAlgorandNetwork = "mainnet" | "testnet";

/**
 * Required on every accepts[] entry for every PDC payment route (CLAUDE.md
 * Section 14, Competition Context: "All endpoints tagged x402-global-challenge
 * in extra field"). Applied centrally in addRoute() below so no call site can
 * forget it — this is a platform-wide, non-negotiable requirement, not a
 * per-route opt-in.
 */
const COMPETITION_TAG = "x402-global-challenge";

export interface PdcX402GateConfig {
  /** SBP's Algorand payTo address for this service (directory query fee lands here). */
  payToAddress: string;
  /** x402 facilitator base URL (GoPlausible per CLAUDE.md Section 6). */
  facilitatorUrl: string;
  network: PdcAlgorandNetwork;
}

export interface PdcPaidRouteSpec {
  /** HTTP method, e.g. "GET". */
  method: string;
  /** Hono-style path, e.g. "/search". */
  path: string;
  /** Price in decimal USDC, e.g. 0.01 for one cent. */
  priceUsdc: number;
  description: string;
  resource: string;
  /**
   * Route-specific metadata merged into accepts[].extra alongside the
   * mandatory competition tag (e.g. { service, category, tier } for a
   * provider endpoint). Do not pass `tag` here — it's set automatically.
   */
  extra?: Record<string, unknown>;
}

/**
 * What a route handler needs after an x402 payment settles, with all x402
 * wire types already stripped away.
 *
 * Settlement happens *after* the route handler already returned its JSON
 * response (x402's exact scheme only charges once the handler succeeds), so
 * there is no request-scoped hook back into the handler at settle time —
 * `responseBody` is the same bytes the handler returned, included here so
 * the app can correlate a settlement with the specific resource it served
 * (e.g. pull `provider.id` back out) without the adapter needing to know
 * any app-specific JSON shape.
 *
 * `path` is the concrete request path actually hit (e.g. "/provider/<uuid>"),
 * not the registered pattern ("/provider/:id") — @x402/hono 2.19 does not
 * thread the matched pattern back through to settlement hooks, only the raw
 * path. Match on prefix, not equality, when dispatching on it.
 */
export interface SettledPdcPayment {
  method: string;
  path: string;
  algoTxId: string;
  payerAddress: string | undefined;
  amountUsdc: string;
  network: PdcAlgorandNetwork;
  responseBody: unknown;
}

type SettleListener = (payment: SettledPdcPayment) => void | Promise<void>;

const CAIP2_BY_NETWORK: Record<PdcAlgorandNetwork, Network> = {
  mainnet: ALGORAND_MAINNET_CAIP2 as Network,
  testnet: ALGORAND_TESTNET_CAIP2 as Network,
};

/**
 * Resolves a PdcAlgorandNetwork ("mainnet"/"testnet") to its CAIP-2 network
 * identifier — added for apps/directory-api's agent discovery route
 * (`/.well-known/x402-directory.json`, Session 6), which needs to publish
 * the network string without importing @x402/avm directly (the "only this
 * module imports @x402/*" rule at the top of this file). Not previously
 * exported because no caller outside PdcPaymentGate needed the raw CAIP-2
 * string before now.
 */
export function getCaip2Network(network: PdcAlgorandNetwork): Network {
  return CAIP2_BY_NETWORK[network];
}

function toAtomicUsdc(priceUsdc: number): string {
  return Math.round(priceUsdc * 10 ** USDC_DECIMALS).toString();
}

/**
 * A payment gate wraps one x402ResourceServer (one facilitator + one
 * registered scheme/network) and the set of paid routes protected by it.
 * One instance per app (e.g. one for the directory API) is the expected
 * usage — do not construct a new instance per request.
 */
export class PdcPaymentGate {
  private readonly resourceServer: x402ResourceServer;
  private readonly network: PdcAlgorandNetwork;
  private readonly caip2Network: Network;
  private readonly payToAddress: string;
  private readonly routesConfig: Record<string, RouteConfig> = {};
  private readonly settleListeners: SettleListener[] = [];

  constructor(config: PdcX402GateConfig) {
    this.network = config.network;
    this.caip2Network = CAIP2_BY_NETWORK[config.network];
    this.payToAddress = config.payToAddress;

    const facilitator = new HTTPFacilitatorClient({ url: config.facilitatorUrl });
    this.resourceServer = new x402ResourceServer(facilitator).register(
      this.caip2Network,
      new ExactAvmScheme(),
    );

    this.resourceServer.onAfterSettle(async (ctx) => {
      const transport = ctx.transportContext as
        | { request?: { path?: string; method?: string }; responseBody?: Buffer }
        | undefined;
      const atomicAmount = ctx.result.amount ?? ctx.requirements.amount;
      const payment: SettledPdcPayment = {
        method: transport?.request?.method ?? "UNKNOWN",
        path: transport?.request?.path ?? "unknown",
        algoTxId: ctx.result.transaction,
        payerAddress: ctx.result.payer,
        amountUsdc: convertFromTokenAmount(atomicAmount, USDC_DECIMALS),
        network: this.network,
        responseBody: parseJsonSafely(transport?.responseBody),
      };
      for (const listener of this.settleListeners) {
        await listener(payment);
      }
    });
  }

  /** Register a paid route. Call once per route at startup, before `middleware()`. */
  addRoute(spec: PdcPaidRouteSpec): void {
    const key = `${spec.method.toUpperCase()} ${spec.path}`;
    this.routesConfig[key] = {
      accepts: {
        scheme: "exact",
        payTo: this.payToAddress,
        // Decimal USDC amount — ExactAvmScheme.parsePrice converts this to the
        // network's default asset (USDC) atomic amount for us.
        price: spec.priceUsdc,
        network: this.caip2Network,
        extra: { tag: COMPETITION_TAG, ...spec.extra },
      },
      resource: spec.resource,
      description: spec.description,
    };
  }

  /** Fired once a protected route's payment has been verified and settled. */
  onSettled(listener: SettleListener): void {
    this.settleListeners.push(listener);
  }

  /** Hono middleware — mount globally; only paths registered via addRoute() are gated. */
  middleware(): MiddlewareHandler {
    return paymentMiddleware(this.routesConfig as RoutesConfig, this.resourceServer);
  }
}

function parseJsonSafely(buffer: Buffer | undefined): unknown {
  if (!buffer || buffer.length === 0) return undefined;
  try {
    return JSON.parse(buffer.toString("utf-8"));
  } catch {
    return undefined;
  }
}

/** Atomic-unit helper exposed for tests / invoices that need to reason about
 * raw USDC amounts without importing @x402/avm directly. */
export const usdcAtomicUnits = {
  fromDecimal: toAtomicUsdc,
  toDecimal: (atomic: string | bigint) => convertFromTokenAmount(atomic, USDC_DECIMALS),
};

/**
 * One-shot facilitator reachability check (CLAUDE.md Section 6: GoPlausible
 * is a SPOF, handle it gracefully). Does not throw — a facilitator outage
 * should degrade a service's health status, not crash it at startup.
 * Distinct from PdcPaymentGate: this needs no payTo/route config, just a
 * yes/no on whether the facilitator is responding.
 */
export async function checkFacilitatorHealth(facilitatorUrl: string): Promise<boolean> {
  try {
    const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });
    await facilitator.getSupported();
    return true;
  } catch {
    return false;
  }
}

export interface ManualPaymentFetchConfig {
  /** Base64-encoded 64-byte Algorand private key (32-byte seed + 32-byte public key). */
  privateKeyBase64: string;
  network: PdcAlgorandNetwork;
}

/**
 * Builds a payment-aware `fetch` that signs and submits real x402 payments
 * client-side from an Algorand private key — the official Algorand x402
 * tutorial's `wrapFetchWithPayment` + `toClientAvmSigner` pattern
 * (https://dev.algorand.co/resources/x402-on-algorand/), GoPlausible-facilitator
 * compatible. This is the client-side counterpart to PdcPaymentGate: same
 * "never import @x402/* outside this file" rule applies to every caller, so
 * this exists instead of callers reaching for @x402/fetch or @x402/avm
 * themselves.
 *
 * Used by manual/dev end-to-end test tooling (test/payment-client.ts scripts)
 * *and* by production apps that spend from an operational wallet (e.g.
 * apps/sbp-agent, apps/agents) — any client-side payer, not dev-only.
 * Server-side is different: a server gates payments with PdcPaymentGate, it
 * doesn't make them, so never wire this into a server request path.
 */
export function createManualPaymentFetch(config: ManualPaymentFetchConfig): typeof fetch {
  const signer = toClientAvmSigner(config.privateKeyBase64);
  const client = new x402Client().register(CAIP2_BY_NETWORK[config.network], new ExactAvmClientScheme(signer));
  return wrapFetchWithPayment(fetch, client);
}

/**
 * Derives the Algorand address for a manual-payment private key, without
 * the caller needing its own Algorand SDK. Used by dev/agent tooling that
 * needs to log or balance-check "the wallet we're paying from" alongside
 * createManualPaymentFetch.
 */
export function getManualPaymentAddress(privateKeyBase64: string): string {
  return toClientAvmSigner(privateKeyBase64).address;
}

export interface DecodedSettlement {
  algoTxId: string;
  payerAddress: string | undefined;
}

/**
 * Reads the `PAYMENT-RESPONSE` header a settled x402 response carries and
 * decodes it, for callers on the *client* side of a payment (e.g. a
 * scheduled agent using createManualPaymentFetch) that want the settled
 * transaction id without re-deriving it themselves. Returns null if the
 * header is missing or the settlement failed — never throws.
 */
export function decodeSettlementFromResponse(response: Response): DecodedSettlement | null {
  const header = response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("payment-response");
  if (!header) return null;
  try {
    const settleResponse = decodePaymentResponseHeader(header);
    if (!settleResponse.success) return null;
    return { algoTxId: settleResponse.transaction, payerAddress: settleResponse.payer };
  } catch {
    return null;
  }
}
