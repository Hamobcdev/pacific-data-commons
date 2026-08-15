import { randomUUID } from "node:crypto";
import type { ZodSchema } from "zod";
import type {
  AgentInput,
  AgentOutput,
  AgentType,
  DataCitation,
  EndpointPreview,
  SovereigntyFlag,
} from "@pdc/shared-types";
import type { DataCategory } from "@pdc/shared-types";
import type { PdcAlgorandNetwork } from "@pdc/x402-adapter";
import {
  createAgentWallet,
  queryEndpoint,
  searchDirectory,
  type AgentWallet,
  type DirectoryEndpointResult,
  type PDCQueryResult,
} from "../lib/pdcClient.js";
import { synthesize } from "../lib/claudeClient.js";
import { submitAttribution } from "../lib/attribution.js";
import { getCurrentPacificSeason, getSeasonalContext, type SeasonalDomain } from "../lib/seasonal.js";
import { logger } from "../lib/logger.js";
import { checkEndpointIntegrity, recordIntegrityEvent } from "../integrity.js";
import { IntegrityCheckFailedError } from "../lib/errors.js";

export interface AgentRuntimeConfig {
  /** This agent's row id in the `agents` table — used in attribution
   * records and (once registered) sovereignty/compliance lookups. */
  agentId: string;
  directoryUrl: string;
  agentWalletKey: string;
  network: PdcAlgorandNetwork;
  supabaseUrl: string;
  supabaseServiceKey: string;
  anthropicApiKey: string;
  claudeModel: string;
  /** Session 17 — shared secret for directory-api's /internal/* routes. */
  internalApiKey: string;
}

/** Injectable for tests — defaults to the real wallet/claude/attribution
 * implementations. Overriding this is how BaseAgent's own tests exercise
 * dry-run, sovereignty refusal, and attribution submission without signing
 * a real transaction or calling the Anthropic API. checkEndpointIntegrity
 * and recordIntegrityEvent are injectable for the same reason (Session 17)
 * — both make real HTTP calls by default, so a live-run test that doesn't
 * override them would otherwise hit real network from a unit test. */
export interface AgentDependencies {
  wallet: AgentWallet;
  searchDirectory: typeof searchDirectory;
  queryEndpoint: typeof queryEndpoint;
  synthesize: typeof synthesize;
  submitAttribution: typeof submitAttribution;
  getSeasonalContext: typeof getSeasonalContext;
  checkEndpointIntegrity: typeof checkEndpointIntegrity;
  recordIntegrityEvent: typeof recordIntegrityEvent;
}

/** Query tier picked for every agent's PDC queries. All six agents query
 * tier 1 (the cheapest/"summary" tier) — the report synthesis needs the
 * verified headline numbers per endpoint, not the raw full dataset. */
const QUERY_TIER = 1;

/** Public surface app.ts/index.ts need from an agent instance — a fresh
 * interface (not "extends BaseAgent") so a test can hand createApp() a
 * plain object with a stubbed `run`, instead of needing a full BaseAgent
 * subclass (BaseAgent has private members, which TS would otherwise require
 * an object to structurally match via nominal inheritance, not a literal). */
export interface RunnableAgent {
  run(input: AgentInput): Promise<AgentOutput>;
  /** The agent's operational wallet address (Model F) — also the address a
   * user's quote payment settles to (Session 13: user-pays-agent leg). Same
   * wallet that pays PDC endpoints; the markup is what it nets. */
  readonly walletAddress: string;
}

export class InsufficientDataError extends Error {
  constructor(category: DataCategory) {
    super(`No active, sovereignty-cleared "${category}" endpoint is available yet.`);
    this.name = "InsufficientDataError";
  }
}

export class SovereigntyBlockedError extends Error {
  constructor(
    public readonly endpointTitle: string,
    reason: string,
  ) {
    super(reason);
    this.name = "SovereigntyBlockedError";
  }
}

/**
 * BaseAgent — shared execution pattern for all six PDC first-party agents
 * (Deliverable 1). Concrete agents supply agentType, inputSchema,
 * requiredCategories, and synthesisPrompt; everything else — validation,
 * sovereignty enforcement, dry-run, payment, synthesis, attribution — lives
 * here so it can't drift between agents.
 *
 * Payment scope note: this class's step 2 checks that the queried PDC
 * endpoints get paid from the agent's own operational wallet (R2/Model F) —
 * it does NOT collect the user's payment to the agent. None of the
 * Session 7 deliverables specify an x402 gate (or any other mechanism) on
 * the POST /agents/:type routes for charging the user a fixed all-in price,
 * and AgentInput carries no payment-proof field a route could verify one
 * against. That collection mechanism (Model F's "user pays agent one
 * all-in price" half) is out of scope here and flagged at the end of this
 * session's report — this class only guarantees the PDC-endpoint-payment
 * half of Model F.
 */
export abstract class BaseAgent {
  abstract agentType: AgentType;
  /** Several agents' schemas have optional fields (z.string().optional()),
   * whose Zod output type is `string | undefined` — not assignable to a
   * plain `Record<string, string>` index signature, hence the union here. */
  abstract inputSchema: ZodSchema<Record<string, string | undefined>>;
  abstract requiredCategories: DataCategory[];
  /** Non-null only for agents whose synthesis benefits from seasonal
   * awareness (fisheries, agricultural, climate) — Deliverable 4. */
  protected seasonalDomain: SeasonalDomain | null = null;

  abstract synthesisPrompt(
    data: Record<string, unknown>[],
    parameters: Record<string, string | undefined>,
    seasonalContext: string | null,
  ): string;

  private readonly config: AgentRuntimeConfig;
  private readonly deps: AgentDependencies;

  get walletAddress(): string {
    return this.deps.wallet.address;
  }

  constructor(config: AgentRuntimeConfig, depsOverride?: Partial<AgentDependencies>) {
    this.config = config;
    const wallet = depsOverride?.wallet ?? createAgentWallet(config.agentWalletKey, config.network);
    this.deps = {
      wallet,
      searchDirectory: depsOverride?.searchDirectory ?? searchDirectory,
      queryEndpoint: depsOverride?.queryEndpoint ?? queryEndpoint,
      synthesize: depsOverride?.synthesize ?? synthesize,
      submitAttribution: depsOverride?.submitAttribution ?? submitAttribution,
      getSeasonalContext: depsOverride?.getSeasonalContext ?? getSeasonalContext,
      checkEndpointIntegrity: depsOverride?.checkEndpointIntegrity ?? checkEndpointIntegrity,
      recordIntegrityEvent: depsOverride?.recordIntegrityEvent ?? recordIntegrityEvent,
    };
  }

  /**
   * Geography scope key used to look up seasonal_contexts
   * (geography_scope column). Deliberately coarse — "pacific_wide" for
   * every agent until a real country-name -> geography_scope mapping table
   * exists (flagged at end of session; session6_1_agent_schema.sql seeded
   * no such mapping). Subclasses may override once one does.
   */
  protected seasonalGeography(_parameters: Record<string, string | undefined>): string {
    return "pacific_wide";
  }

  /**
   * Sovereignty check (R6) — must pass before an endpoint is queried. An
   * endpoint flagged indigenous_data_flag=true, or cultural_sensitivity
   * "high", with no permitted_use_cases declared is refused: absence of any
   * declared use case is treated as "not cleared for agent querying," a
   * fail-closed reading of P1/R6 rather than assuming silence means yes.
   */
  protected checkSovereigntyFlags(endpoint: DirectoryEndpointResult): { safe: boolean; reason?: string } {
    const uncleared = endpoint.permitted_use_cases.length === 0;
    if (endpoint.indigenous_data_flag && uncleared) {
      return {
        safe: false,
        reason: `"${endpoint.title}" is flagged indigenous_data_flag=true with no permitted_use_cases declared.`,
      };
    }
    if (endpoint.cultural_sensitivity === "high" && uncleared) {
      return {
        safe: false,
        reason: `"${endpoint.title}" has cultural_sensitivity=high with no permitted_use_cases declared.`,
      };
    }
    return { safe: true };
  }

  /**
   * Submits the attribution record for this run (R1/Decision 37). Called
   * by run() after endpoint payments happen, whether or not synthesis
   * later succeeds — the payments happened and must be attributed
   * regardless. Never throws; a failed submission is logged by the caller
   * via the returned result, not raised as an exception (a compliance gap
   * must not crash an otherwise-successful user-facing run).
   */
  protected async submitAttribution(runId: string, txIds: string[], userWallet: string): Promise<void> {
    if (txIds.length === 0) return;
    const result = await this.deps.submitAttribution({
      directoryApiUrl: this.config.directoryUrl,
      agentWalletKeyBase64: this.config.agentWalletKey,
      agentOperationalWalletAddress: this.deps.wallet.address,
      agentId: this.config.agentId,
      runId,
      endpointTxIds: txIds,
      originatingUserWallet: userWallet,
    });
    if (!result.success) {
      logger.error("attribution_submission_failed", {
        run_id: runId,
        agent_type: this.agentType,
        error: result.error,
      });
    }
  }

  /**
   * Resolves one sovereignty-cleared, active endpoint per required
   * category and returns both the endpoints (for a live run) and the
   * dry-run preview shape — shared by both paths so they can never
   * describe a different endpoint set than the one actually queried.
   */
  private async resolveEndpoints(
    parameters: Record<string, string | undefined>,
  ): Promise<{ endpoint: DirectoryEndpointResult; tier: number; priceUsdc: number; reason: string }[]> {
    const country = parameters.country ?? parameters.zone ?? parameters.location ?? undefined;
    const resolved: { endpoint: DirectoryEndpointResult; tier: number; priceUsdc: number; reason: string }[] = [];

    for (const category of this.requiredCategories) {
      const results = await this.deps.searchDirectory(this.deps.wallet, this.config.directoryUrl, category, country);

      if (results.length === 0) {
        throw new InsufficientDataError(category);
      }

      let chosen: DirectoryEndpointResult | undefined;
      let blockedReason: string | undefined;
      for (const candidate of results) {
        const check = this.checkSovereigntyFlags(candidate);
        if (check.safe) {
          chosen = candidate;
          break;
        }
        blockedReason ??= check.reason;
      }

      if (!chosen) {
        // Data exists for this category, but every candidate failed the
        // sovereignty check — distinct from InsufficientDataError (no data
        // at all) so the web UI can show the correct one of the two error
        // states the session brief specifies.
        throw new SovereigntyBlockedError(
          results[0]?.title ?? category,
          blockedReason ?? `All "${category}" endpoints available are sovereignty-restricted.`,
        );
      }

      const tierSpec = chosen.pricing_tiers.find((t) => t.tier === QUERY_TIER);
      if (!tierSpec) {
        throw new InsufficientDataError(category);
      }

      resolved.push({
        endpoint: chosen,
        tier: QUERY_TIER,
        priceUsdc: tierSpec.price_usdc,
        reason: `Provides verified "${category}" data for this ${this.agentType} report.`,
      });
    }

    return resolved;
  }

  /**
   * Main execution method (Deliverable 1's 8-step pattern). Steps 1-4 run
   * for both dry_run and live requests; dry_run stops after step 4 (R8).
   */
  async run(input: AgentInput): Promise<AgentOutput> {
    const runId = randomUUID();

    // Step 1 — validate input.
    const parsed = this.inputSchema.safeParse(input.parameters);
    if (!parsed.success) {
      throw new Error(`Invalid parameters: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    const parameters = parsed.data;

    // Step 3a (dry-run branch) / Step 4 — resolve endpoints, sovereignty-checked.
    const resolved = await this.resolveEndpoints(parameters);

    if (input.dry_run) {
      const preview: EndpointPreview[] = resolved.map((r) => ({
        endpoint_id: r.endpoint.endpoint_id,
        title: r.endpoint.title,
        tier: r.tier,
        price_usdc: r.priceUsdc,
        reason: r.reason,
      }));
      return {
        agent_type: this.agentType,
        run_id: runId,
        dry_run: true,
        preview: {
          endpoints_to_query: preview,
          estimated_cost_usdc: preview.reduce((sum, p) => sum + p.price_usdc, 0),
          output_shape: `A synthesized ${this.agentType} report combining ${this.requiredCategories.join(", ")} data: a plain-language summary plus structured fields specific to this agent.`,
        },
        citations: [],
        total_cost_usdc: 0,
        generated_at: new Date().toISOString(),
      };
    }

    // Step 3 — seasonal context (graceful null if unavailable or not applicable).
    let seasonalContext: string | null = null;
    if (this.seasonalDomain) {
      seasonalContext = await this.deps.getSeasonalContext({
        supabaseUrl: this.config.supabaseUrl,
        supabaseServiceKey: this.config.supabaseServiceKey,
        geography: this.seasonalGeography(parameters),
        domain: this.seasonalDomain,
      });
      if (!seasonalContext) {
        const month = new Date().getUTCMonth() + 1;
        seasonalContext = getCurrentPacificSeason(this.seasonalGeography(parameters), month);
      }
    }

    // Step 5 — pay for and fetch each resolved endpoint. A single endpoint
    // failure doesn't abort the whole run — the other endpoints' payments
    // already happened and must still be attributed and cited.
    const queryResults: PDCQueryResult[] = [];
    const citations: DataCitation[] = [];
    const sovereigntyFlags: SovereigntyFlag[] = [];

    for (const r of resolved) {
      sovereigntyFlags.push({
        endpoint_id: r.endpoint.endpoint_id,
        indigenous_data_flag: r.endpoint.indigenous_data_flag,
        cultural_sensitivity: r.endpoint.cultural_sensitivity,
        note: r.endpoint.indigenous_data_flag || r.endpoint.cultural_sensitivity !== "none" ? "Sovereignty-cleared for agent querying." : "No sovereignty restrictions declared.",
      });

      try {
        // Session 17 (Decision 49) — automatic tamper check before payment.
        // Only 'fail' (a confirmed hash mismatch) blocks this endpoint;
        // 'no_cert_hash' and 'endpoint_unavailable' proceed to payment.
        // Thrown inside this same try/catch (not before it) deliberately:
        // an IntegrityCheckFailedError must skip only this endpoint, the
        // same as a queryEndpoint HTTP failure below — not abort the whole
        // run and lose attribution for endpoints already paid this loop.
        const integrityResult = await this.deps.checkEndpointIntegrity(
          r.endpoint.endpoint_id,
          r.endpoint.integrity_url,
          this.config.directoryUrl,
          this.config.internalApiKey,
        );

        logger.info("integrity_check", {
          run_id: runId,
          endpoint_id: r.endpoint.endpoint_id,
          status: integrityResult.status,
          passed: integrityResult.passed,
        });

        // Fire-and-forget — never awaited inline, never allowed to block or
        // fail the query below over a logging write.
        this.deps
          .recordIntegrityEvent(this.config.directoryUrl, this.config.internalApiKey, {
            endpointId: r.endpoint.endpoint_id,
            checkTrigger: "agent_query",
            status: integrityResult.status,
            expectedHash: integrityResult.expectedHash,
            actualHash: integrityResult.actualHash,
            agentId: this.config.agentId,
            transactionBlocked: integrityResult.status === "fail",
          })
          .catch((err) =>
            logger.error("integrity_event_record_failed", {
              run_id: runId,
              endpoint_id: r.endpoint.endpoint_id,
              error: err instanceof Error ? err.message : String(err),
            }),
          );

        if (integrityResult.status === "fail") {
          throw new IntegrityCheckFailedError(integrityResult.message);
        }

        const result = await this.deps.queryEndpoint(this.deps.wallet, r.endpoint, r.tier);
        queryResults.push(result);
        citations.push({
          endpoint_id: r.endpoint.endpoint_id,
          endpoint_title: r.endpoint.title,
          provider_institution: r.endpoint.provider_institution,
          trust_tier: r.endpoint.trust_tier,
          algo_tx_id: result.algo_tx_id,
          amount_usdc: result.amount_usdc,
          provenance_hash: result.provenance_hash,
        });
      } catch (err) {
        logger.error(err instanceof IntegrityCheckFailedError ? "agent_endpoint_integrity_check_failed" : "agent_endpoint_query_failed", {
          run_id: runId,
          agent_type: this.agentType,
          endpoint_id: r.endpoint.endpoint_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (queryResults.length === 0) {
      throw new Error("All PDC endpoint queries failed for this run — no data available to synthesise.");
    }

    const totalCostUsdc = citations.reduce((sum, c) => sum + c.amount_usdc, 0);
    const taggedData = queryResults.flatMap((r) => tagSource(r.data, r.source_category));

    // Step 6 — Claude synthesis. Failure here doesn't lose the run: the
    // endpoint payments already happened, so attribution (step 7) still
    // runs and citations/cost are still returned (R7: synthesis output is
    // data, and its absence is reported plainly, not papered over).
    let synthesis: string | undefined;
    let structuredData: unknown;
    let dataWarning: string | undefined;
    try {
      const result = await this.deps.synthesize({
        apiKey: this.config.anthropicApiKey,
        model: this.config.claudeModel,
        prompt: this.synthesisPrompt(taggedData, parameters, seasonalContext),
      });
      synthesis = result.raw_text;
      structuredData = result.structured_data ?? undefined;
    } catch (err) {
      dataWarning = `Synthesis failed after payment — raw citations are still returned: ${err instanceof Error ? err.message : String(err)}`;
    }

    // Step 7 — attribution (R1/Decision 37) — always, regardless of synthesis outcome.
    await this.submitAttribution(
      runId,
      citations.map((c) => c.algo_tx_id).filter((id) => id.length > 0),
      input.user_wallet,
    );

    // Step 8 — structured result with citations.
    return {
      agent_type: this.agentType,
      run_id: runId,
      dry_run: false,
      synthesis,
      structured_data: structuredData,
      citations,
      total_cost_usdc: totalCostUsdc,
      generated_at: new Date().toISOString(),
      data_warning: dataWarning,
      sovereignty_flags: sovereigntyFlags,
    };
  }
}

/** Tags each record (or the single object) returned by one endpoint query
 * with `_source` = the category it came from, so synthesisPrompt
 * implementations (fisheries, agricultural) can `data.filter(d => d._source === "...")`
 * to interpret cross-category data correctly (R5). */
function tagSource(data: unknown, source: DataCategory): Record<string, unknown>[] {
  const records = Array.isArray(data) ? data : [data];
  return records.map((record) => ({
    ...(typeof record === "object" && record !== null ? (record as Record<string, unknown>) : { value: record }),
    _source: source,
  }));
}
