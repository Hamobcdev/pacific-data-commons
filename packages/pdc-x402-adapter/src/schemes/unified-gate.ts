/**
 * PdcUnifiedPaymentGate — Algorand + Base + Solana behind one
 * x402ResourceServer, one accepts[] per route, one Hono middleware mount.
 *
 * feat/unified-payment-gate supersedes the earlier (abandoned, uncommitted)
 * feat/payai-multichain-facilitator design: three separate gate classes
 * (PdcPaymentGate / PdcEvmPaymentGate / PdcSvmPaymentGate), each with its
 * own resource server, each mounted as a *separate* global Hono middleware.
 * That design had a real correctness bug: whichever gate was mounted first
 * fully resolved any request to a path all three registered, so the other
 * two's middleware was never even reached for that path — three gates
 * racing for the same routes, not three chains offered on equal footing.
 *
 * The fix here is architectural, not a patch: ONE x402ResourceServer, with
 * all enabled chains' schemes registered on it, and ONE accepts[] per route
 * listing every enabled chain's PaymentOption. A paying agent gets all
 * options in a single 402 challenge and picks whichever chain it holds —
 * no racing, because there is only one gate and one middleware to begin
 * with.
 *
 * Two things this relies on, both confirmed by reading @x402/core 2.30.0's
 * actual source (not assumed):
 *
 * 1. x402ResourceServer accepts `FacilitatorClient | FacilitatorClient[]`.
 *    With an array, `initialize()` calls `getSupported()` on every client
 *    and records, per (x402Version, network, scheme), whichever facilitator
 *    first claimed support for it — so GoPlausible (Algorand-only) and
 *    PayAI (Base/Solana) can coexist in one array and each request still
 *    reaches the correct facilitator automatically, driven by each
 *    facilitator's own advertised coverage, not by array order alone.
 *    (`getFacilitatorClient()`'s lookup falls back to trying every client
 *    in order only on a genuine cache miss — a resilience fallback, not the
 *    primary routing mechanism.)
 * 2. `.register(network, scheme)` and `.onAfterSettle(hook)` were never
 *    Algorand-specific — both operate on a bare CAIP-2 Network string and a
 *    chain-agnostic SettleResultContext (confirmed from @x402/core's own
 *    type defs), which is what makes one resourceServer registering three
 *    chains' schemes at once a real, supported pattern rather than a hack.
 */
import { x402ResourceServer, type FacilitatorClient, type RouteConfig } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import type { PaymentOption } from "@x402/core/http";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { convertFromTokenAmount, USDC_DECIMALS as ALGORAND_USDC_DECIMALS } from "@x402/avm";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { SOLANA_MAINNET_CAIP2 } from "@x402/svm";
import type { MiddlewareHandler } from "hono";
import { getCaip2Network, type PdcAlgorandNetwork, type PdcPaidRouteSpec } from "./algorand.js";
import {
  COMPETITION_TAG,
  FACILITATOR_TIMEOUT_MS,
  atomicUsdcToDecimalString,
  buildGuardedMiddleware,
  createGuardedFacilitator,
  parseJsonSafely,
  type PdcMerchantIdentity,
} from "./gate-shared.js";

/**
 * Standard CAIP-2 identifier for Base mainnet — "eip155:8453". Not exported
 * as a named constant by @x402/evm (unlike @x402/avm's
 * ALGORAND_MAINNET_CAIP2 or @x402/svm's SOLANA_MAINNET_CAIP2), but confirmed
 * against @x402/evm's own DEFAULT_ASSETS table keys ("eip155:8453", read
 * directly from its built runtime bundle) rather than assumed from the
 * CAIP-2 spec alone. Mainnet only, deliberately — PdcUnifiedGateConfig has
 * no Base-testnet/Solana-devnet selector; see that interface's doc comment.
 */
const BASE_MAINNET_CAIP2 = "eip155:8453" as Network;

export interface PdcUnifiedGateConfig {
  // Algorand — required, always enabled.
  algorandNetwork: PdcAlgorandNetwork;
  /** GoPlausible (CLAUDE.md Section 6). */
  algorandFacilitatorUrl: string;
  /** AVM_ADDRESS — SBP's Algorand payTo wallet. */
  algorandMerchantAddress: string;

  // Base — optional, enabled only when the flag is true AND the chain's
  // own required config is present (see PdcUnifiedPaymentGate's
  // constructor for the exact compound condition).
  enableBase?: boolean;
  /** PDC_BASE_MERCHANT_ADDRESS. */
  baseMerchantAddress?: `0x${string}`;
  /** PayAI's facilitator URL — shared with Solana below, not a second,
   * independent URL to reuse-if-equal: there is only ever one configured
   * PayAI endpoint in this config, used for whichever of Base/Solana are
   * enabled. */
  payaiFacilitatorUrl?: string;

  // Solana — optional, enabled only when the flag is true AND the chain's
  // own required config is present.
  enableSolana?: boolean;
  /** PDC_SOLANA_MERCHANT_ADDRESS. */
  solanaMerchantAddress?: string;
  /** SOLANA_RPC_URL — also embeds a recent blockhash in the 402 challenge via ExactSvmScheme. */
  solanaRpcUrl?: string;

  // Shared.
  /** Overrides gate-shared.ts's FACILITATOR_TIMEOUT_MS (8000ms) for every
   * facilitator client this gate constructs, Algorand and PayAI alike. */
  facilitatorTimeoutMs?: number;
  merchant: PdcMerchantIdentity;
}

/**
 * Chain-agnostic settlement payload delivered to onSettled() listeners,
 * covering Algorand, Base, and Solana settlements alike through one
 * callback. `algoTxId`/`network` are populated only for `chain ===
 * "algorand"` — kept specifically so existing Algorand-only callers (e.g.
 * apps/directory-api's logSettledDirectoryQuery, typed against
 * SettledPdcPayment from schemes/algorand.ts) can still be driven from this
 * event without changing that function or its Supabase schema.
 */
export interface SettledUnifiedPayment {
  method: string;
  path: string;
  /** Chain-agnostic transaction/signature identifier (Algorand tx id, Base tx hash, or Solana signature). */
  txId: string;
  chain: "algorand" | "base" | "solana";
  payerAddress: string;
  amountUsdc: number;
  responseBody: unknown;
  /** Algorand only — identical value to `txId`, named for SettledPdcPayment-shaped callers. */
  algoTxId?: string;
  /** Algorand only. */
  network?: PdcAlgorandNetwork;
}

type UnifiedSettleListener = (payment: SettledUnifiedPayment) => void | Promise<void>;

/**
 * One instance per app — do not construct per request. Construct once,
 * call addRoute() for every paid route at startup, then middleware() once.
 */
export class PdcUnifiedPaymentGate {
  private readonly resourceServer: x402ResourceServer;
  private readonly algorandNetwork: PdcAlgorandNetwork;
  private readonly algorandCaip2: Network;
  private readonly algorandMerchantAddress: string;
  private readonly baseActive: boolean;
  private readonly baseMerchantAddress: `0x${string}` | undefined;
  private readonly solanaActive: boolean;
  private readonly solanaMerchantAddress: string | undefined;
  private readonly merchant: PdcMerchantIdentity;
  private readonly routesConfig: Record<string, RouteConfig> = {};
  private readonly settleListeners: UnifiedSettleListener[] = [];

  constructor(config: PdcUnifiedGateConfig) {
    this.algorandNetwork = config.algorandNetwork;
    this.algorandCaip2 = getCaip2Network(config.algorandNetwork);
    this.algorandMerchantAddress = config.algorandMerchantAddress;
    this.merchant = config.merchant;

    // Each chain's own three-way AND — matches the task spec's Step 3
    // items 3/4 exactly: a flag with incomplete config must not half-enable
    // a chain (e.g. registering the scheme but never actually being able to
    // reach a facilitator for it).
    this.baseActive = Boolean(config.enableBase && config.payaiFacilitatorUrl && config.baseMerchantAddress);
    this.baseMerchantAddress = config.baseMerchantAddress;
    this.solanaActive = Boolean(
      config.enableSolana && config.payaiFacilitatorUrl && config.solanaMerchantAddress && config.solanaRpcUrl,
    );
    this.solanaMerchantAddress = config.solanaMerchantAddress;

    const timeoutMs = config.facilitatorTimeoutMs ?? FACILITATOR_TIMEOUT_MS;
    const facilitatorClients: FacilitatorClient[] = [createGuardedFacilitator(config.algorandFacilitatorUrl, timeoutMs)];
    if ((this.baseActive || this.solanaActive) && config.payaiFacilitatorUrl) {
      // One PayAI client serves both chains — there is only one configured
      // PayAI URL in this config to begin with (see payaiFacilitatorUrl's
      // doc comment above), so there is no "reuse if same URL" branch to
      // write: it's structurally one client either way.
      facilitatorClients.push(createGuardedFacilitator(config.payaiFacilitatorUrl, timeoutMs));
    }

    this.resourceServer = new x402ResourceServer(facilitatorClients);
    this.resourceServer.register(this.algorandCaip2, new ExactAvmScheme());
    if (this.baseActive) {
      this.resourceServer.register(BASE_MAINNET_CAIP2, new ExactEvmScheme());
    }
    if (this.solanaActive) {
      this.resourceServer.register(
        SOLANA_MAINNET_CAIP2 as Network,
        new ExactSvmScheme(config.solanaRpcUrl ? { rpcUrl: config.solanaRpcUrl } : undefined),
      );
    }

    this.resourceServer.onAfterSettle(async (ctx) => {
      const transport = ctx.transportContext as
        | { request?: { path?: string; method?: string }; responseBody?: Buffer }
        | undefined;
      const atomicAmount = ctx.result.amount ?? ctx.requirements.amount;
      const common = {
        method: transport?.request?.method ?? "UNKNOWN",
        path: transport?.request?.path ?? "unknown",
        txId: ctx.result.transaction,
        payerAddress: ctx.result.payer ?? "",
        responseBody: parseJsonSafely(transport?.responseBody),
      };

      let payment: SettledUnifiedPayment;
      if (ctx.requirements.network === this.algorandCaip2) {
        payment = {
          ...common,
          chain: "algorand",
          amountUsdc: Number(convertFromTokenAmount(atomicAmount, ALGORAND_USDC_DECIMALS)),
          algoTxId: ctx.result.transaction,
          network: this.algorandNetwork,
        };
      } else if (ctx.requirements.network === BASE_MAINNET_CAIP2) {
        payment = { ...common, chain: "base", amountUsdc: Number(atomicUsdcToDecimalString(atomicAmount)) };
      } else if (ctx.requirements.network === (SOLANA_MAINNET_CAIP2 as Network)) {
        payment = { ...common, chain: "solana", amountUsdc: Number(atomicUsdcToDecimalString(atomicAmount)) };
      } else {
        // Shouldn't happen — onAfterSettle only fires for a network this
        // gate itself registered a scheme for — but log loudly and skip
        // rather than guess a chain label for a settlement we can't
        // attribute, if it ever does.
        // eslint-disable-next-line no-console
        console.error("x402_unified_gate_unknown_settled_network", { network: ctx.requirements.network, path: common.path });
        return;
      }

      for (const listener of this.settleListeners) {
        await listener(payment);
      }
    });
  }

  /**
   * Register a paid route. Call once per route at startup, before
   * `middleware()`. Produces ONE RouteConfig whose accepts[] lists every
   * enabled chain's PaymentOption — the fix for the racing-gates issue:
   * agents see all options in a single 402 challenge and pick the chain
   * they support, instead of three separate gates each gating the same
   * path independently.
   */
  addRoute(spec: PdcPaidRouteSpec): void {
    const key = `${spec.method.toUpperCase()} ${spec.path}`;
    const identity = this.merchant;
    const sharedExtra = {
      tag: COMPETITION_TAG,
      ...(identity.description ? { merchant_description: identity.description } : {}),
      ...(identity.url ? { merchant_url: identity.url } : {}),
      ...spec.extra,
    };

    const accepts: PaymentOption[] = [
      {
        scheme: "exact",
        payTo: spec.payToAddress ?? this.algorandMerchantAddress,
        // Decimal USDC amount — each registered ExactXxxScheme's parsePrice
        // converts this to its own network's default asset (USDC) atomic
        // amount for us.
        price: spec.priceUsdc,
        network: this.algorandCaip2,
        extra: sharedExtra,
      },
    ];

    if (this.baseActive) {
      accepts.push({
        scheme: "exact",
        payTo: spec.evmPayToAddress ?? this.baseMerchantAddress!,
        price: spec.priceUsdc,
        network: BASE_MAINNET_CAIP2,
        extra: sharedExtra,
      });
    }

    if (this.solanaActive) {
      accepts.push({
        scheme: "exact",
        payTo: spec.svmPayToAddress ?? this.solanaMerchantAddress!,
        price: spec.priceUsdc,
        network: SOLANA_MAINNET_CAIP2 as Network,
        extra: sharedExtra,
      });
    }

    if (spec.additionalAccepts?.length) {
      accepts.push(...spec.additionalAccepts);
    }

    this.routesConfig[key] = {
      accepts: accepts.length > 1 ? accepts : accepts[0]!,
      resource: spec.resource,
      description: spec.description,
      ...(spec.mimeType ? { mimeType: spec.mimeType } : {}),
      ...(identity.serviceName ? { serviceName: identity.serviceName } : {}),
      ...(identity.iconUrl ? { iconUrl: identity.iconUrl } : {}),
      ...(identity.tags ? { tags: identity.tags } : {}),
      ...(spec.extensions ? { extensions: spec.extensions } : {}),
    };

    // Same HEAD workaround as the Algorand-only gate (x402-foundation/x402#3796)
    // — the underlying @x402/hono router-matching gap is chain-agnostic.
    if (spec.method.toUpperCase() === "GET") {
      this.routesConfig[`HEAD ${spec.path}`] = this.routesConfig[key]!;
    }
  }

  /** Fired once a protected route's payment has been verified and settled, on any enabled chain. */
  onSettled(listener: UnifiedSettleListener): void {
    this.settleListeners.push(listener);
  }

  /** Hono middleware — mount globally, once; only paths registered via addRoute() are gated. */
  middleware(): MiddlewareHandler {
    return buildGuardedMiddleware(this.resourceServer, this.routesConfig);
  }
}
