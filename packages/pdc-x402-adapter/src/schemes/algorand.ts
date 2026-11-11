/**
 * Algorand (AVM) scheme for pdc-x402-adapter.
 *
 * This file is a straight move of what used to be the package's entire
 * src/index.ts (pre-2026-11-09 multi-chain refactor) — every type,
 * class, and function below is unchanged from that file except for one
 * addition at the bottom (verifyAndSettleAlgorand, new). index.ts now
 * imports from here and re-exports everything so existing callers across
 * the repo (apps/directory-api, apps/pilot-endpoint, apps/agents,
 * apps/sbp-agent, apps/web) keep working without modification.
 *
 * Pinned to @x402/* 2.30.x (bumped 2026-11-09, fix/x402-route-headers —
 * 2.19.x's ALGORAND_MAINNET_CAIP2/ALGORAND_TESTNET_CAIP2 used the full
 * genesis hash; every @x402/avm release from 2.20.0 onward uses the
 * short-form CAIP-2 id GoPlausible and the rest of the ecosystem expect).
 * Bump the pin here, once, when upgrading again.
 */
import { x402ResourceServer, type RouteConfig } from "@x402/core/server";
import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader, type PaymentOption } from "@x402/core/http";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { Network } from "@x402/core/types";
import {
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_TESTNET_CAIP2,
  convertFromTokenAmount,
  toClientAvmSigner,
  USDC_DECIMALS,
  USDC_MAINNET_ASA_ID,
  USDC_TESTNET_ASA_ID,
} from "@x402/avm";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { ExactAvmScheme as ExactAvmClientScheme } from "@x402/avm/exact/client";
import type { MiddlewareHandler } from "hono";
import algosdk from "algosdk";
import type { AlgorandPaymentProof, PdcSettlementResult } from "../types.js";
import { splitProviderAndSbp } from "../types.js";
import {
  COMPETITION_TAG,
  buildGuardedMiddleware,
  createGuardedFacilitator,
  parseJsonSafely,
  type PdcMerchantIdentity,
} from "./gate-shared.js";

export {
  FacilitatorTimeoutError,
  PaymentGateTimeoutError,
  raceWithTimeout,
  type PdcMerchantIdentity,
} from "./gate-shared.js";

export type PdcAlgorandNetwork = "mainnet" | "testnet";

/**
 * @deprecated Superseded by PdcUnifiedGateConfig + PdcUnifiedPaymentGate
 * (schemes/unified-gate.ts, feat/unified-payment-gate) — one resource
 * server advertising Algorand + Base + Solana in a single accepts[] per
 * route, instead of one gate per chain racing for the same paths. This
 * type and PdcPaymentGate are unchanged and fully supported — existing
 * callers do not need to migrate, and nothing here is removed.
 */
export interface PdcX402GateConfig {
  /** SBP's Algorand payTo address for this service (directory query fee lands here). */
  payToAddress: string;
  /** x402 facilitator base URL (GoPlausible per CLAUDE.md Section 6). */
  facilitatorUrl: string;
  network: PdcAlgorandNetwork;
  /** Applied to every route registered via addRoute() — see PdcMerchantIdentity's doc comment (gate-shared.ts). */
  merchantIdentity?: PdcMerchantIdentity;
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
   * Overrides the gate's default payToAddress for this route only. Use for
   * an endpoint whose earnings should be tracked separately from the
   * gate's main payTo wallet (e.g. an institutional-earnings pilot routed
   * to a dedicated wallet rather than SBP's main directory wallet).
   * Defaults to the gate's payToAddress when omitted — existing callers
   * are unaffected.
   */
  payToAddress?: string;
  /**
   * Base (EVM) payTo override for this route only, read by
   * PdcUnifiedPaymentGate (schemes/unified-gate.ts) — ignored by the
   * Algorand-only PdcPaymentGate above. Falls back to the unified gate's
   * config.baseMerchantAddress when omitted. Not meaningful without
   * PdcUnifiedGateConfig.enableBase.
   */
  evmPayToAddress?: `0x${string}`;
  /**
   * Solana payTo override for this route only, read by
   * PdcUnifiedPaymentGate (schemes/unified-gate.ts) — ignored by the
   * Algorand-only PdcPaymentGate above. Falls back to the unified gate's
   * config.solanaMerchantAddress when omitted. Not meaningful without
   * PdcUnifiedGateConfig.enableSolana.
   */
  svmPayToAddress?: string;
  /**
   * Route-specific metadata merged into accepts[].extra alongside the
   * mandatory competition tag (e.g. { service, category, tier } for a
   * provider endpoint). Do not pass `tag` here — it's set automatically.
   */
  extra?: Record<string, unknown>;
  /**
   * x402 v2 route-level extensions (RouteConfig.extensions in @x402/core —
   * distinct from accepts[].extra above). Passed through to the resource
   * server as-is; @x402/core reads `extensions.bazaar` natively via
   * checkIfBazaarNeeded/enrichExtensions and forwards it into the 402
   * response's PaymentRequired.extensions (Session 8.1, Bazaar discovery).
   * Build the value with @x402-avm/extensions' declareDiscoveryExtension —
   * that package is a pure metadata builder with no @x402/core coupling, so
   * this stays the only place in the adapter that has to know the field
   * name x402-core expects.
   */
  extensions?: Record<string, unknown>;
  /**
   * Non-Algorand payment options to publish alongside the Algorand entry.
   * @x402/core's RouteConfig.accepts natively supports PaymentOption |
   * PaymentOption[] (confirmed from its own type defs) — addRoute() below
   * always builds the Algorand PaymentOption itself; this lets a caller
   * append other chains' options without this adapter needing to know
   * anything about those chains. Deliberately unused by any call site yet
   * (2026-11-09 fix/x402-route-headers) — cross-chain settlement through
   * GoPlausible hasn't been verified, so no route passes this today.
   */
  additionalAccepts?: PaymentOption[];
  /** -> RouteConfig.mimeType. Omitted entirely (library default) when unset. */
  mimeType?: string;
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
  private readonly merchantIdentity: PdcMerchantIdentity | undefined;
  private readonly routesConfig: Record<string, RouteConfig> = {};
  private readonly settleListeners: SettleListener[] = [];

  constructor(config: PdcX402GateConfig) {
    this.network = config.network;
    this.caip2Network = CAIP2_BY_NETWORK[config.network];
    this.payToAddress = config.payToAddress;
    this.merchantIdentity = config.merchantIdentity;

    this.resourceServer = new x402ResourceServer(createGuardedFacilitator(config.facilitatorUrl)).register(
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
    const identity = this.merchantIdentity;
    const algorandAccept: PaymentOption = {
      scheme: "exact",
      payTo: spec.payToAddress ?? this.payToAddress,
      // Decimal USDC amount — ExactAvmScheme.parsePrice converts this to the
      // network's default asset (USDC) atomic amount for us.
      price: spec.priceUsdc,
      network: this.caip2Network,
      extra: {
        tag: COMPETITION_TAG,
        ...(identity?.description ? { merchant_description: identity.description } : {}),
        ...(identity?.url ? { merchant_url: identity.url } : {}),
        ...spec.extra,
      },
    };
    this.routesConfig[key] = {
      accepts: spec.additionalAccepts?.length ? [algorandAccept, ...spec.additionalAccepts] : algorandAccept,
      resource: spec.resource,
      description: spec.description,
      ...(spec.mimeType ? { mimeType: spec.mimeType } : {}),
      ...(identity?.serviceName ? { serviceName: identity.serviceName } : {}),
      ...(identity?.iconUrl ? { iconUrl: identity.iconUrl } : {}),
      ...(identity?.tags ? { tags: identity.tags } : {}),
      ...(spec.extensions ? { extensions: spec.extensions } : {}),
    };
  }

  /** Fired once a protected route's payment has been verified and settled. */
  onSettled(listener: SettleListener): void {
    this.settleListeners.push(listener);
  }

  /** Hono middleware — mount globally; only paths registered via addRoute() are gated. */
  middleware(): MiddlewareHandler {
    return buildGuardedMiddleware(this.resourceServer, this.routesConfig);
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
    const facilitator = createGuardedFacilitator(facilitatorUrl);
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
 *
 * Session 26 — checked for a client-side canary/note hook (Volume Integrity
 * Policy: label sbp-agent's own monitoring transactions as non-organic
 * volume) and confirmed there isn't one at the pinned @x402/* 2.19.x
 * version: `wrapFetchWithPayment(fetch, client)` takes no metadata param,
 * and `ExactAvmScheme.createPaymentPayload` (client-side, @x402/avm) builds
 * its transaction group from `paymentRequirements` alone — no note-field or
 * extra passthrough. `accepts[].extra` (PdcPaidRouteSpec.extra above) is
 * server-advertised payment terms, not something a payer can attach to.
 * TODO post-competition: investigate on-chain canary labelling via a
 * hand-constructed AVM transaction group with a note field — deliberately
 * deferred rather than attempted here, since it means bypassing
 * wrapFetchWithPayment and touching the competition-critical payment path
 * two days before the Session 26 NUS pilot demo. Current approach is
 * off-chain: apps/sbp-agent/src/agent.ts tags its own structured logs
 * (`type: "canary"`) on every settled cycle, and directory-api's /health
 * publishes the monitoring wallet address for cross-reference.
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

/**
 * Public AlgoNode indexer endpoints (CLAUDE.md Section 6: "AlgoNode free
 * tier (automatic failover)"). No API key required. Override with
 * PDC_ALGORAND_INDEXER_URL to point at Nodely (the documented primary) or
 * any other indexer instead.
 */
const ALGONODE_INDEXER_URL: Record<PdcAlgorandNetwork, string> = {
  mainnet: "https://mainnet-idx.algonode.cloud",
  testnet: "https://testnet-idx.algonode.cloud",
};

function algorandFailureResult(proof: AlgorandPaymentProof, timestamp: string, error: string): PdcSettlementResult {
  return { success: false, chain: "algorand", proof, providerAmountUsd: 0, sbpAmountUsd: 0, timestamp, metadata: { error } };
}

/**
 * NEW (2026-11-09, multi-chain refactor) — not a move of existing logic.
 * Nothing in the pre-refactor adapter verified a bare txId standalone;
 * PdcPaymentGate verifies payments as part of the live @x402/hono 402
 * challenge/response cycle, and decodeSettlementFromResponse() only
 * decodes a header from a request this process just made itself. This
 * function answers a different question — "did this already-submitted
 * Algorand transaction pay expectedAmountUsdc to our merchant address?" —
 * via a direct Algorand Indexer lookup, giving Algorand parity with the
 * new Base/Solana verifyAndSettle schemes (see schemes/evm-base.ts,
 * schemes/solana.ts and REFACTOR_NOTES.md for why those are also
 * independent chain-RPC checks rather than full @x402/avm-style gates).
 *
 * Gated on VITE_FLAG_LIVE_RPC_ACTIVE the same way as the new EVM/SVM
 * schemes, for consistency — this is new code making real outbound RPC
 * calls, same as those, even though the prompt that asked for this gate
 * only mentioned Base/Solana explicitly.
 */
export async function verifyAndSettleAlgorand(
  proof: AlgorandPaymentProof,
  expectedAmountUsdc: number,
): Promise<PdcSettlementResult> {
  const timestamp = new Date().toISOString();

  if (process.env.VITE_FLAG_LIVE_RPC_ACTIVE !== "true") {
    const { providerAmountUsd, sbpAmountUsd } = splitProviderAndSbp(expectedAmountUsdc);
    return { success: true, chain: "algorand", proof, providerAmountUsd, sbpAmountUsd, timestamp, metadata: { dry_run: true } };
  }

  const merchantAddress = process.env.PDC_ALGORAND_MERCHANT_ADDRESS;
  if (!merchantAddress) {
    throw new Error("PDC_ALGORAND_MERCHANT_ADDRESS is not set");
  }

  const expectedAsaId = proof.network === "mainnet" ? USDC_MAINNET_ASA_ID : USDC_TESTNET_ASA_ID;
  const indexerUrl = process.env.PDC_ALGORAND_INDEXER_URL ?? ALGONODE_INDEXER_URL[proof.network];
  const indexer = new algosdk.Indexer("", indexerUrl, "");

  let txn;
  try {
    txn = await indexer.lookupTransactionByID(proof.txId).do();
  } catch (error) {
    return algorandFailureResult(proof, timestamp, `algorand_lookup_failed: ${(error as Error).message}`);
  }

  const transfer = txn.transaction.assetTransferTransaction;
  if (!transfer) {
    return algorandFailureResult(proof, timestamp, "not_an_asset_transfer_transaction");
  }
  if (transfer.assetId.toString() !== expectedAsaId) {
    return algorandFailureResult(proof, timestamp, "wrong_asset");
  }
  if (transfer.receiver !== merchantAddress) {
    return algorandFailureResult(proof, timestamp, "wrong_receiver");
  }

  const actualAmountUsdc = Number(convertFromTokenAmount(transfer.amount, USDC_DECIMALS));
  if (actualAmountUsdc < expectedAmountUsdc) {
    return algorandFailureResult(proof, timestamp, "amount_too_low");
  }

  const { providerAmountUsd, sbpAmountUsd } = splitProviderAndSbp(expectedAmountUsdc);
  return { success: true, chain: "algorand", proof, providerAmountUsd, sbpAmountUsd, timestamp };
}
