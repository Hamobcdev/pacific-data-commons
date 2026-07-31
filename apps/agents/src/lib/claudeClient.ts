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
 * Sends an agent's synthesisPrompt (built entirely from PDC-queried data —
 * see BaseAgent) to Claude and returns both the raw text and a best-effort
 * JSON parse of it.
 *
 * P9 applies fully here: this result is returned to the caller as data. It
 * is never fed back into another LLM call as instructions (R7), and never
 * evaluated or executed — BaseAgent only reads named fields off
 * `structured_data` for display.
 */
export async function synthesize(params: { apiKey: string; model: string; prompt: string }): Promise<SynthesisResult> {
  const anthropic = getClient(params.apiKey);
  const message = await anthropic.messages.create({
    model: params.model,
    max_tokens: 2048,
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
