import {
  FatalError,
  LlmAdapter,
  LlmCompletionRequest,
  RetryableError,
  withRetry,
  type Logger,
} from "@ksp/shared";

/**
 * OpenAI-compatible chat-completions adapter. Works with any provider exposing the
 * standard /chat/completions route, including:
 *  - Google Gemini (free tier): base https://generativelanguage.googleapis.com/v1beta/openai
 *    with an AI Studio API key, model e.g. "gemini-2.0-flash"
 *  - Groq (free tier): base https://api.groq.com/openai/v1
 *  - OpenRouter: base https://openrouter.ai/api/v1
 *  - Local Ollama (no key, fully offline): base http://localhost:11434/v1
 *
 * Note: smaller free models follow the JSON-output contract less reliably than Claude.
 * That is safe here — schema validation and the claims firewall reject bad output, and
 * a failed generation simply means no concept/email for that prospect that day — but
 * expect occasional QA rejections with small models.
 */
export class OpenAiCompatAdapter implements LlmAdapter {
  readonly source = "openai-compatible";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly model: string,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(req: LlmCompletionRequest): Promise<string> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.4,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    };
    if (req.jsonResponse) {
      // Widely supported hint; providers that ignore it still get the prompt instruction.
      body.response_format = { type: "json_object" };
    }

    const text = await withRetry(async () => {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new RetryableError("LLM_TRANSIENT", `LLM endpoint ${res.status}`);
      }
      if (!res.ok) {
        // Some providers reject response_format — retry once without it.
        const errText = await res.text();
        if (req.jsonResponse && /response_format/i.test(errText)) {
          delete body.response_format;
          throw new RetryableError("LLM_FORMAT_UNSUPPORTED", "retrying without response_format");
        }
        throw new FatalError("LLM_ERROR", `LLM endpoint ${res.status}: ${errText.slice(0, 400)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const out = data.choices?.[0]?.message?.content;
      if (!out) throw new FatalError("LLM_EMPTY", "LLM endpoint returned no content");
      return out;
    });

    if (req.jsonResponse) {
      const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
      try {
        JSON.parse(cleaned);
        return cleaned;
      } catch {
        throw new RetryableError("LLM_BAD_JSON", "LLM response was not valid JSON");
      }
    }
    this.logger.debug("llm completion ok", { chars: text.length });
    return text;
  }
}
