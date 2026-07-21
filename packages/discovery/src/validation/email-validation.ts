import {
  EmailValidationAdapter,
  EmailValidationVerdict,
  RetryableError,
  FatalError,
  withRetry,
  type Logger,
} from "@ksp/shared";
import { resolveMx } from "node:dns/promises";

/**
 * Real adapter: ZeroBounce-compatible HTTP validation API.
 * Configure EMAIL_VALIDATION_API_URL + EMAIL_VALIDATION_API_KEY.
 */
export class HttpEmailValidationAdapter implements EmailValidationAdapter {
  readonly source = "http-email-validation";

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async validate(email: string): Promise<{ verdict: EmailValidationVerdict; detail?: string }> {
    const url = `${this.apiUrl}?api_key=${encodeURIComponent(this.apiKey)}&email=${encodeURIComponent(email)}`;
    const data = await withRetry(async () => {
      const res = await this.fetchImpl(url);
      if (res.status === 429 || res.status >= 500) {
        throw new RetryableError("VALIDATION_TRANSIENT", `validation API ${res.status}`);
      }
      if (!res.ok) throw new FatalError("VALIDATION_ERROR", `validation API ${res.status}`);
      return (await res.json()) as { status?: string; sub_status?: string };
    });

    const map: Record<string, EmailValidationVerdict> = {
      valid: "VALID",
      invalid: "INVALID",
      "catch-all": "RISKY",
      unknown: "UNKNOWN",
      spamtrap: "INVALID",
      abuse: "INVALID",
      do_not_mail: "INVALID",
    };
    const verdict = map[data.status ?? "unknown"] ?? "UNKNOWN";
    this.logger.debug("email validated", { verdict });
    return { verdict, detail: data.sub_status };
  }
}

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Mock adapter: RFC-shape check + (for non-example domains) an MX lookup.
 * Reserved example/test domains validate as VALID so the mock pipeline can flow;
 * addresses containing "invalid" always fail (test hook).
 */
export class MockEmailValidationAdapter implements EmailValidationAdapter {
  readonly source = "mock-email-validation";

  async validate(email: string): Promise<{ verdict: EmailValidationVerdict; detail?: string }> {
    if (!EMAIL_RE.test(email)) return { verdict: "INVALID", detail: "syntax" };
    if (email.includes("invalid")) return { verdict: "INVALID", detail: "mock-marker" };
    const domain = email.split("@")[1]!.toLowerCase();
    if (domain.endsWith("example.com") || domain.endsWith("example.org") || domain.endsWith("test")) {
      return { verdict: "VALID", detail: "mock-reserved-domain" };
    }
    try {
      const mx = await resolveMx(domain);
      return mx.length > 0 ? { verdict: "VALID", detail: "mx" } : { verdict: "INVALID", detail: "no-mx" };
    } catch {
      return { verdict: "INVALID", detail: "mx-lookup-failed" };
    }
  }
}
