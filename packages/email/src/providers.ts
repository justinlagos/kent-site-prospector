import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  EmailProviderAdapter,
  FatalError,
  OutboundEmail,
  RetryableError,
  SendResult,
  withRetry,
  randomToken,
  type Logger,
} from "@ksp/shared";

/** Postmark adapter. Tag carries our idempotency reference for reconciliation. */
export class PostmarkAdapter implements EmailProviderAdapter {
  readonly source = "postmark";

  constructor(
    private readonly serverToken: string,
    private readonly messageStream: string,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(email: OutboundEmail): Promise<SendResult> {
    return withRetry(async () => {
      const res = await this.fetchImpl("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Postmark-Server-Token": this.serverToken,
        },
        body: JSON.stringify({
          From: email.from,
          To: email.to,
          ReplyTo: email.replyTo,
          Subject: email.subject,
          TextBody: email.textBody,
          HtmlBody: email.htmlBody,
          MessageStream: this.messageStream,
          Tag: email.reference.slice(0, 1000),
          TrackOpens: false,
          TrackLinks: "None",
          Headers: Object.entries(email.headers).map(([Name, Value]) => ({ Name, Value })),
        }),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new RetryableError("POSTMARK_TRANSIENT", `Postmark ${res.status}`);
      }
      const data = (await res.json()) as { MessageID?: string; Message?: string; ErrorCode?: number };
      if (!res.ok || !data.MessageID) {
        throw new FatalError("POSTMARK_ERROR", `Postmark ${res.status} code=${data.ErrorCode}: ${data.Message}`);
      }
      this.logger.info("postmark send accepted", { reference: email.reference });
      return { providerMessageId: data.MessageID, submittedAt: new Date().toISOString() };
    });
  }

  async findByReference(reference: string): Promise<SendResult | null> {
    const res = await this.fetchImpl(
      `https://api.postmarkapp.com/messages/outbound?count=1&offset=0&tag=${encodeURIComponent(reference)}`,
      { headers: { Accept: "application/json", "X-Postmark-Server-Token": this.serverToken } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      Messages?: Array<{ MessageID: string; ReceivedAt: string }>;
    };
    const msg = data.Messages?.[0];
    return msg ? { providerMessageId: msg.MessageID, submittedAt: msg.ReceivedAt } : null;
  }
}

/**
 * Mock provider: writes RFC-5322-style .eml files to an outbox directory and keeps a
 * JSON index so findByReference works for reconciliation tests.
 */
export class MockEmailProviderAdapter implements EmailProviderAdapter {
  readonly source = "mock-email";

  constructor(private readonly outboxDir: string) {}

  private indexPath(): string {
    return path.join(this.outboxDir, "index.json");
  }

  private async readIndex(): Promise<Record<string, SendResult>> {
    try {
      return JSON.parse(await readFile(this.indexPath(), "utf8")) as Record<string, SendResult>;
    } catch {
      return {};
    }
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    await mkdir(this.outboxDir, { recursive: true });
    const index = await this.readIndex();
    if (index[email.reference]) {
      // Provider-level idempotency mirror: same reference returns the original result.
      return index[email.reference]!;
    }
    const id = `mock-${randomToken()}`;
    const eml = [
      `From: ${email.from}`,
      `To: ${email.to}`,
      `Reply-To: ${email.replyTo}`,
      `Subject: ${email.subject}`,
      ...Object.entries(email.headers).map(([k, v]) => `${k}: ${v}`),
      `Message-ID: <${id}@mock.local>`,
      `Date: ${new Date().toUTCString()}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      email.textBody,
    ].join("\r\n");
    await writeFile(path.join(this.outboxDir, `${id}.eml`), eml);
    const result: SendResult = { providerMessageId: id, submittedAt: new Date().toISOString() };
    index[email.reference] = result;
    await writeFile(this.indexPath(), JSON.stringify(index, null, 2));
    return result;
  }

  async findByReference(reference: string): Promise<SendResult | null> {
    const index = await this.readIndex();
    return index[reference] ?? null;
  }
}
