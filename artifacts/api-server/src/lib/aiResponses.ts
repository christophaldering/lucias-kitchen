/**
 * Thin wrapper around the OpenAI Responses API.
 * Use this instead of openai.chat.completions for text/JSON generation with gpt-5+,
 * which returns null message.content via the legacy chat endpoint.
 */

const OPENAI_BASE = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "").replace(/\/$/, "");
const OPENAI_KEY  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "";

type ConversationMessage = { role: "user" | "assistant"; content: string };

interface CallOptions {
  model: string;
  /** System-level instructions (replaces the "system" chat role). */
  instructions?: string;
  /** Plain prompt string or a conversation turn array. */
  input: string | ConversationMessage[];
  /**
   * Max tokens for the ENTIRE completion (reasoning + output).
   * gpt-5 as a reasoning model consumes tokens for hidden reasoning before
   * producing visible output. Default 2000 to leave enough room for output.
   */
  maxOutputTokens?: number;
  timeoutMs?: number;
}

/** Call the Responses API and return the generated text. Throws on HTTP errors. */
export async function callAiResponses(opts: CallOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    input: opts.input,
  };
  if (opts.instructions) body.instructions = opts.instructions;
  // Default 2000 — gpt-5 reasoning tokens count against this budget,
  // so small values produce incomplete responses with empty text.
  body.max_output_tokens = opts.maxOutputTokens ?? 2000;

  const apiRes = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text().catch(() => "");
    throw new Error(`AI Responses API ${apiRes.status}: ${errText.slice(0, 200)}`);
  }

  const data = await apiRes.json() as Record<string, unknown>;

  // Extract text from the output[] array (same structure as webSearch.ts)
  let text = "";
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (item && typeof item === "object" && (item as Record<string, unknown>).type === "message") {
      const content = (item as Record<string, unknown>).content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c && typeof c === "object") {
            const t = (c as Record<string, unknown>).type;
            if (t === "output_text" || t === "text") {
              text += String((c as Record<string, unknown>).text ?? "");
            }
          }
        }
      }
    }
  }
  return text;
}
