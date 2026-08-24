import Anthropic from "@anthropic-ai/sdk";

export interface SynthesisResult {
  raw_text: string;
  /** Best-effort JSON parse of raw_text — null if Claude didn't return
   * parseable JSON (a malformed/refused response), never thrown. */
  structured_data: unknown;
}

let cachedClient: Anthropic | undefined;

function getClient(apiKey: string): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

/**
 * Deliberate duplicate of apps/agents/src/lib/claudeClient.ts — directory-api
 * and apps/agents are separate deployable services with no shared runtime
 * dependency beyond @pdc/shared-types and @pdc/x402-adapter, same reasoning
 * as apps/sbp-agent/src/lib/attribution.ts's identical "deliberate
 * duplicate" note.
 *
 * P9 applies fully: this result is returned to the caller as data. It is
 * never fed back into another LLM call as instructions, and never evaluated
 * or executed — pacificIntelligenceService.ts only reads named fields off
 * `structured_data` after schema validation.
 */
export async function synthesize(params: {
  apiKey: string;
  model: string;
  systemPrompt?: string;
  prompt: string;
  maxTokens?: number;
}): Promise<SynthesisResult> {
  const anthropic = getClient(params.apiKey);
  const message = await anthropic.messages.create({
    model: params.model,
    max_tokens: params.maxTokens ?? 1024,
    ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
    messages: [{ role: "user", content: params.prompt }],
  });

  const rawText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return { raw_text: rawText, structured_data: tryParseJson(rawText) };
}

/** Strips a ```json fence if present — Claude occasionally wraps JSON in
 * one despite the prompt asking for bare JSON — before attempting to parse. */
function tryParseJson(text: string): unknown {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}
