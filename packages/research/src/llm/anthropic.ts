import {
  FatalError,
  LlmAdapter,
  LlmCompletionRequest,
  RetryableError,
  withRetry,
  type Logger,
} from "@ksp/shared";

/** Claude API adapter (Messages API via fetch; no SDK dependency to keep the tree lean). */
export class AnthropicAdapter implements LlmAdapter {
  readonly source = "anthropic";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(req: LlmCompletionRequest): Promise<string> {
    const body = {
      model: this.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.4,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    };

    const text = await withRetry(async () => {
      const res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status === 529 || res.status >= 500) {
        throw new RetryableError("LLM_TRANSIENT", `Claude API ${res.status}`);
      }
      if (!res.ok) {
        throw new FatalError("LLM_ERROR", `Claude API ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const out = data.content?.find((c) => c.type === "text")?.text;
      if (!out) throw new FatalError("LLM_EMPTY", "Claude API returned no text content");
      return out;
    });

    if (req.jsonResponse) {
      const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
      try {
        JSON.parse(cleaned);
        return cleaned;
      } catch {
        throw new RetryableError("LLM_BAD_JSON", "Claude response was not valid JSON");
      }
    }
    this.logger.debug("llm completion ok", { chars: text.length });
    return text;
  }
}
