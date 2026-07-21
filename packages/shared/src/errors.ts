/** Typed error hierarchy. Only RetryableError is retried by withRetry(). */

export class KspError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(code: string, message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.context = context;
  }
}

/** Transient failure (network, 429, 5xx, timeouts). Safe to retry. */
export class RetryableError extends KspError {}

/** Permanent failure (bad request, invalid data, 4xx other than 429). Do not retry. */
export class FatalError extends KspError {}

/** A compliance control blocked the operation. Never retried, always logged loudly. */
export class ComplianceError extends KspError {}

/** QA pipeline rejected a concept. Blocks deploy + email. */
export class QaFailureError extends KspError {
  readonly failures: string[];
  constructor(failures: string[], context: Record<string, unknown> = {}) {
    super("QA_FAILED", `QA failed: ${failures.join("; ")}`, context);
    this.failures = failures;
  }
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
  /** injectable for tests */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Exponential backoff with full jitter. Retries RetryableError only. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 15_000;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!(err instanceof RetryableError) || attempt === maxAttempts) throw err;
      const cap = Math.min(max, base * 2 ** (attempt - 1));
      const delay = Math.floor(Math.random() * cap);
      opts.onRetry?.(attempt, err);
      await sleep(delay);
    }
  }
  throw lastError;
}
