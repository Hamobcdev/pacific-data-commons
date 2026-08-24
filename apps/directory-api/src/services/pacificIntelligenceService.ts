import { randomUUID, randomBytes, createHash } from "node:crypto";
import nacl from "tweetnacl";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createManualPaymentFetch, decodeSettlementFromResponse, getManualPaymentAddress, type PdcAlgorandNetwork } from "@pdc/x402-adapter";
import type { AttributionRequest } from "@pdc/shared-types";
import { synthesize as synthesizeReal, type SynthesisResult } from "../lib/claudeClient.js";
import { selfRegisterAgent } from "./agentSelfRegisterService.js";
import { submitAttribution as submitAttributionRecord } from "./attributionService.js";
import { logger } from "../lib/logger.js";

/**
 * The Pacific Intelligence Orchestrator (Session 31).
 *
 * A single x402-gated GET /intelligence/pacific-brief query pays 3 live PDC
 * sub-endpoints from the SBP agent wallet, then synthesises the results with
 * Claude into a structured brief. This is the x402 "Orchestrator" competition
 * entry pattern (CLAUDE.md Section 14): one user payment fans out into
 * several machine-to-machine payments, settled on Algorand Mainnet.
 *
 * Session 31 intelligence phase corrected two premises in the original
 * session brief before any code was written (user-confirmed):
 *
 * 1. Endpoint set — the brief assumed a /fisheries and a distinct /ocean
 *    route existed on pilot-endpoint. Neither exists: pilot-endpoint only
 *    ever serves the one synthetic tuna dataset (/summary, /slice, /full,
 *    /expert, /commission), and the directory's "ocean" category is a
 *    second discovery tag on that SAME dataset (Session 14 — see
 *    apps/pilot-endpoint/src/services/directoryContext.ts's doc comment),
 *    not independent ocean-conditions data. There is also no live climate
 *    endpoint. Querying "fisheries" + "ocean" as if they were two sources
 *    would pay twice for byte-identical data and mislabel it to Claude as
 *    independent findings — a P9/P7 honesty problem, not just a wasted
 *    $0.01. This orchestrator instead queries the 3 genuinely distinct live
 *    payable resources every run — pilot-endpoint fisheries summary,
 *    directory-api's own FX rates, and its own wallet-balance check — for
 *    every topic. `topic`/`country` shape only the synthesis framing, not
 *    which endpoints get paid.
 *
 * 2. Payer wallet — the brief's named orchestrator wallet
 *    (Q5XTALN45D32I572OZAVZ4FW6UYSW6A4FFAX4YOY6PP3YCD4JJJ3JQRYKI) is not a
 *    new dedicated wallet; it is apps/sbp-agent's own existing operational
 *    wallet/identity. User-confirmed reuse of that same wallet (via
 *    env.AGENT_WALLET_KEY here) as an interim measure for the Sep 2026
 *    Monash timeline — see env.ts's AGENT_WALLET_KEY comment for the
 *    consequence (attribution merges into the existing "SBP Pilot Agent"
 *    identity) and the post-Monash TODO to split it out.
 */

export class AllSubEndpointsFailedError extends Error {
  constructor() {
    super("All PDC sub-endpoint queries failed — cannot generate an intelligence brief.");
    this.name = "AllSubEndpointsFailedError";
  }
}

export interface PacificBriefPayment {
  endpoint: string;
  category: string;
  tx_id: string | null;
  amount_usdc: number;
}

export interface PacificBrief {
  topic: string;
  country: string;
  executive_summary: string;
  key_findings: string[];
  data_sources: Array<{ name: string; queried_at: string; category: string }>;
  limitations: string;
  confidence: "high" | "medium" | "low";
  /** Always populated — carries forward pilot-endpoint's own PDP-1.0
   * data_warning field (present on every paid PDC response) rather than
   * relying on Claude to remember to mention it (P9: don't trust the LLM
   * with a compliance-relevant caveat that can be sourced structurally). */
  data_warning: string;
  payments: PacificBriefPayment[];
  total_sub_payments_usdc: number;
  orchestrated_at: string;
  run_id: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  WS: "Samoa",
  FJ: "Fiji",
  TO: "Tonga",
  PG: "Papua New Guinea",
  SB: "Solomon Islands",
  VU: "Vanuatu",
  CK: "Cook Islands",
  NU: "Niue",
};

const synthesisSchema = z.object({
  executive_summary: z.string().min(1),
  key_findings: z.array(z.string()).min(1),
  limitations: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

const SYNTHESIS_SYSTEM_PROMPT = `You are a Pacific data intelligence analyst for the Pacific Data Commons.
You receive raw JSON data retrieved this run from live PDC endpoints and
synthesise it into a concise, structured intelligence brief.

Rules:
- Synthesise only from the data provided — never fabricate or assume facts not present in it.
- The fisheries data is explicitly SYNTHETIC DEMO DATA (see its own data_warning field in the input). Never present it as a real scientific finding — state plainly it is demonstration data whenever you reference it.
- State clearly which data source each finding comes from (fisheries, finance, or algorand).
- Flag any data gaps or limitations explicitly, including any source that failed to return data this run.
- Use plain language appropriate for policy makers and researchers.
- Never imply easy conversion of USDC to local Pacific currency or cash — USDC is a USD-pegged digital asset, not "digital cash".
- Keep the brief under 400 words total.

Output ONLY valid JSON matching this exact schema, with no markdown fences and no other text:
{
  "executive_summary": "string, 2-3 sentences",
  "key_findings": ["string", "string", "string"],
  "limitations": "string, 1-2 sentences",
  "confidence": "high" | "medium" | "low"
}`;

interface SubEndpointSpec {
  key: "fisheries" | "fx" | "wallet_balance";
  category: string;
  url: string;
  priceUsdc: number;
}

interface SubQueryResult {
  key: SubEndpointSpec["key"];
  category: string;
  data: unknown;
  dataWarning?: string;
}

function buildUserPrompt(topic: string, country: string, subResults: SubQueryResult[]): string {
  const countryName = COUNTRY_NAMES[country] ?? country;
  const rawData = Object.fromEntries(subResults.map((r) => [r.key, r.data]));
  return `Generate a Pacific intelligence brief.
Topic requested: ${topic}
Country/Region context: ${countryName}

Raw data retrieved this run from PDC endpoints (JSON, keyed by source):
${JSON.stringify(rawData, null, 2)}

Return ONLY the JSON object described in the system prompt.`;
}

const ATTRIBUTION_SIGNATURE_VERSION = "v1";

function buildAttributionSignedMessage(params: { runId: string; agentId: string; nonce: string; timestamp: string }): string {
  return `pdc-attribution:${ATTRIBUTION_SIGNATURE_VERSION}:${params.runId}:${params.agentId}:${params.nonce}:${params.timestamp}`;
}

function hashWallet(address: string): string {
  return createHash("sha256").update(address).digest("hex");
}

/**
 * Signs and submits this run's Decision 37 attribution record — but calls
 * attributionService.ts's submitAttribution() directly rather than
 * HTTP-POSTing to this same process's own POST /agent/attribution (the
 * pattern apps/sbp-agent and apps/agents use, since they run in different
 * processes from directory-api). Directory-api hosts both the signer and
 * the verifier here, so the HTTP hop would only add latency and a
 * self-referential PUBLIC_URL dependency for no correctness benefit — the
 * signature is still built and verified for real, exercising the exact
 * same validation path an external caller's HTTP request would.
 *
 * originating_user_wallet_hash is the orchestrator's own operational
 * wallet: no separate "originating user" exists for this run in the way
 * apps/agents' BaseAgent has one (a user_wallet supplied in the request
 * body) — the orchestrator is a first-party SBP capability paid via x402
 * like /search or /finance/fx, not an agent fronting for a named buyer.
 * Same reasoning as apps/sbp-agent's own canary attribution.
 */
async function submitOrchestratorAttribution(params: {
  supabase: SupabaseClient;
  agentWalletKeyBase64: string;
  agentOperationalWalletAddress: string;
  agentId: string;
  runId: string;
  endpointTxIds: string[];
}): Promise<{ success: boolean; error?: string }> {
  if (params.endpointTxIds.length === 0) {
    return { success: false, error: "no endpoint transactions to attribute" };
  }

  const secretKey = new Uint8Array(Buffer.from(params.agentWalletKeyBase64, "base64"));
  const nonce = randomBytes(16).toString("hex");
  const timestamp = new Date().toISOString();
  const message = buildAttributionSignedMessage({ runId: params.runId, agentId: params.agentId, nonce, timestamp });
  const signature = nacl.sign.detached(new TextEncoder().encode(message), secretKey);

  const body: AttributionRequest = {
    run_id: params.runId,
    agent_id: params.agentId,
    endpoint_tx_ids: params.endpointTxIds,
    originating_user_wallet_hash: hashWallet(params.agentOperationalWalletAddress),
    signed_by: params.agentOperationalWalletAddress,
    signature: Buffer.from(signature).toString("base64"),
    nonce,
    timestamp,
  };

  try {
    await submitAttributionRecord(params.supabase, body);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface GeneratePacificBriefParams {
  topic: string;
  country: string;
  supabase: SupabaseClient;
  agentWalletKey: string;
  network: PdcAlgorandNetwork;
  pilotEndpointUrl: string;
  publicUrl: string;
  avmAddress: string;
  anthropicApiKey: string;
  claudeModel: string;
  /** Injectable for tests — defaults to the real @pdc/x402-adapter fetch. */
  createPayingFetch?: (key: string, network: PdcAlgorandNetwork) => typeof fetch;
  /** Injectable for tests — defaults to the real Anthropic-backed implementation. */
  synthesizeFn?: (params: { apiKey: string; model: string; systemPrompt?: string; prompt: string; maxTokens?: number }) => Promise<SynthesisResult>;
}

export async function generatePacificBrief(params: GeneratePacificBriefParams): Promise<PacificBrief> {
  const runId = randomUUID();
  const orchestratedAt = new Date().toISOString();

  const buildPayingFetch = params.createPayingFetch ?? ((key: string, network: PdcAlgorandNetwork) => createManualPaymentFetch({ privateKeyBase64: key, network }));
  const payingFetch = buildPayingFetch(params.agentWalletKey, params.network);
  const walletAddress = getManualPaymentAddress(params.agentWalletKey);

  const payments: PacificBriefPayment[] = [];
  const subResults: SubQueryResult[] = [];

  const subEndpoints: SubEndpointSpec[] = [
    { key: "fisheries", category: "fisheries", url: `${params.pilotEndpointUrl.replace(/\/$/, "")}/summary`, priceUsdc: 0.01 },
    { key: "fx", category: "finance", url: `${params.publicUrl.replace(/\/$/, "")}/finance/fx`, priceUsdc: 0.001 },
    { key: "wallet_balance", category: "algorand", url: `${params.publicUrl.replace(/\/$/, "")}/algorand/wallet-balance?address=${params.avmAddress}`, priceUsdc: 0.005 },
  ];

  // Sequential, not Promise.all — the orchestrator's own wallet signs one
  // payment at a time, same "settlement ordering" reasoning as
  // apps/sbp-agent's tick() loop and runQueryCycle's category loop.
  for (const spec of subEndpoints) {
    try {
      const res = await payingFetch(spec.url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as Record<string, unknown>;
      const settlement = decodeSettlementFromResponse(res);
      const dataWarning = typeof body.data_warning === "string" ? body.data_warning : undefined;
      // pilot-endpoint's PDP-1.0 envelope wraps the payload in `data`;
      // directory-api's own /finance/fx and /algorand/wallet-balance don't
      // (their responses ARE the payload) — this branch handles both
      // without a per-source special case.
      const data = "data" in body ? body.data : body;

      payments.push({
        endpoint: spec.url,
        category: spec.category,
        tx_id: settlement?.algoTxId ?? null,
        amount_usdc: spec.priceUsdc,
      });
      subResults.push({ key: spec.key, category: spec.category, data, dataWarning });
    } catch (err) {
      // Log but don't fail the whole run — synthesise from whatever
      // sub-endpoints did succeed, same as every other multi-source
      // aggregation in this codebase (BaseAgent's endpoint loop,
      // sbp-agent's per-category cycle).
      logger.error("orchestrator_sub_endpoint_failed", {
        run_id: runId,
        key: spec.key,
        url: spec.url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (subResults.length === 0) {
    throw new AllSubEndpointsFailedError();
  }

  // Attribution (Decision 37) — regardless of synthesis outcome below: the
  // payments already happened and must be attributed either way, same
  // ordering as BaseAgent's step 7 and sbp-agent's canary checks.
  const agentId = await selfRegisterAgent(params.supabase, {
    agent_name: "Pacific Intelligence Orchestrator",
    agent_type: "fisheries_status",
    operational_wallet: walletAddress,
    description:
      "SBP's own Orchestrator (Session 31): pays multiple PDC sub-endpoints per user query and synthesises the results with Claude. Shares its operational wallet with apps/sbp-agent's dogfooding canary during the POC — see directory-api's env.ts AGENT_WALLET_KEY comment.",
  })
    .then((r) => r.agent_id)
    .catch((err: unknown) => {
      logger.warn("orchestrator_self_register_failed", { run_id: runId, error: err instanceof Error ? err.message : String(err) });
      return undefined;
    });

  const successfulTxIds = payments.map((p) => p.tx_id).filter((id): id is string => Boolean(id));
  if (agentId && successfulTxIds.length > 0) {
    const attribution = await submitOrchestratorAttribution({
      supabase: params.supabase,
      agentWalletKeyBase64: params.agentWalletKey,
      agentOperationalWalletAddress: walletAddress,
      agentId,
      runId,
      endpointTxIds: successfulTxIds,
    });
    if (!attribution.success) {
      logger.warn("orchestrator_attribution_submission_failed", { run_id: runId, error: attribution.error });
    }
  }

  // Synthesis — failure here doesn't lose the run: the sub-endpoint
  // payments already happened, so the response still returns real payment/
  // data_source data with a low-confidence fallback brief (P9: LLM output
  // is untrusted — both a thrown error and a schema-invalid response
  // degrade to the same structured fallback, never a 500).
  const doSynthesize = params.synthesizeFn ?? synthesizeReal;
  let synthesis: z.infer<typeof synthesisSchema> | undefined;
  try {
    const result = await doSynthesize({
      apiKey: params.anthropicApiKey,
      model: params.claudeModel,
      systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
      prompt: buildUserPrompt(params.topic, params.country, subResults),
      maxTokens: 1000,
    });
    const parsed = synthesisSchema.safeParse(result.structured_data);
    if (parsed.success) {
      synthesis = parsed.data;
    } else {
      logger.warn("orchestrator_synthesis_schema_invalid", { run_id: runId, issues: parsed.error.issues });
    }
  } catch (err) {
    logger.error("orchestrator_synthesis_failed", { run_id: runId, error: err instanceof Error ? err.message : String(err) });
  }

  const fallback = {
    executive_summary: "Pacific data was retrieved successfully but the synthesis service could not produce a structured brief this run.",
    key_findings: subResults.map((r) => `${r.category} data retrieved successfully.`),
    limitations: "Synthesis unavailable this run — raw payment and category data is included in this response's payments/data_sources fields.",
    confidence: "low" as const,
  };
  const finalSynthesis = synthesis ?? fallback;

  const dataWarnings = Array.from(new Set(subResults.map((r) => r.dataWarning).filter((w): w is string => Boolean(w))));
  const combinedDataWarning = dataWarnings.length > 0 ? dataWarnings.join(" ") : "One or more PDC sub-endpoints did not return a data_warning field.";

  const totalSubPayments = payments.reduce((sum, p) => sum + p.amount_usdc, 0);

  return {
    topic: params.topic,
    country: params.country,
    executive_summary: finalSynthesis.executive_summary,
    key_findings: finalSynthesis.key_findings,
    data_sources: subResults.map((r) => ({ name: r.key, queried_at: orchestratedAt, category: r.category })),
    limitations: finalSynthesis.limitations ?? "",
    confidence: finalSynthesis.confidence ?? "medium",
    data_warning: combinedDataWarning,
    payments,
    total_sub_payments_usdc: Math.round(totalSubPayments * 1_000_000) / 1_000_000,
    orchestrated_at: orchestratedAt,
    run_id: runId,
  };
}
