import { z } from "zod";

/**
 * Central, zod-validated configuration.
 *
 * Safety model:
 *  - APP_ENV=production refuses to boot with any mock adapter, with a missing agency
 *    identity, or with email authentication flags unconfirmed.
 *  - Email sending additionally requires EMAIL_DRY_RUN=false. The default is dry-run.
 *  - EMAIL_KILL_SWITCH=true halts sending everywhere, immediately.
 */

const boolFromEnv = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === "true" || v === "1"));

const adapterMode = z.enum(["real", "mock"]);

export const envSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  SHADOW_DATABASE_URL: z.string().url().optional(),

  // --- Agency identity (required for any real send; placeholders block production) ---
  AGENCY_NAME: z.string().default(""),
  AGENCY_WEBSITE: z.string().default(""),
  AGENCY_PHONE: z.string().default(""),
  AGENCY_POSTAL_ADDRESS: z.string().default(""),
  AGENCY_SENDER_NAME: z.string().default(""),
  AGENCY_SENDER_EMAIL: z.string().default(""),
  AGENCY_REPLY_TO_EMAIL: z.string().default(""),

  // --- Adapter selection ---
  DIRECTORY_ADAPTER: adapterMode.default("mock"),
  REGISTRY_ADAPTER: adapterMode.default("mock"),
  EMAIL_VALIDATION_ADAPTER: adapterMode.default("mock"),
  LLM_ADAPTER: adapterMode.default("mock"),
  DEPLOY_ADAPTER: adapterMode.default("mock"),
  EMAIL_PROVIDER_ADAPTER: adapterMode.default("mock"),

  // --- Provider credentials (each required only when its adapter is `real`) ---
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  COMPANIES_HOUSE_API_KEY: z.string().optional(),
  EMAIL_VALIDATION_API_KEY: z.string().optional(),
  EMAIL_VALIDATION_API_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-5"),
  /**
   * LLM provider when LLM_ADAPTER=real:
   *  - "anthropic": Claude API (ANTHROPIC_API_KEY)
   *  - "openai-compatible": any OpenAI-compatible endpoint — Google Gemini
   *    (https://generativelanguage.googleapis.com/v1beta/openai), Groq, OpenRouter,
   *    or a local Ollama (http://localhost:11434/v1, no key needed).
   */
  LLM_PROVIDER: z.enum(["anthropic", "openai-compatible"]).default("anthropic"),
  OPENAI_COMPAT_BASE_URL: z.string().url().optional(),
  OPENAI_COMPAT_API_KEY: z.string().optional(),
  OPENAI_COMPAT_MODEL: z.string().optional(),
  NETLIFY_API_TOKEN: z.string().optional(),
  NETLIFY_ACCOUNT_SLUG: z.string().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  POSTMARK_MESSAGE_STREAM: z.string().default("outbound"),
  POSTMARK_WEBHOOK_TOKEN: z.string().optional(),

  // --- Email safety controls ---
  EMAIL_DRY_RUN: boolFromEnv(true),
  EMAIL_KILL_SWITCH: boolFromEnv(false),
  EMAIL_DOMAIN_AUTH_CONFIRMED: boolFromEnv(false), // operator asserts SPF+DKIM+DMARC are live
  DAILY_FIRST_CONTACT_LIMIT: z.coerce.number().int().min(0).max(10).default(2),
  SEND_WINDOW_START_HOUR: z.coerce.number().int().min(8).max(12).default(10),
  SEND_WINDOW_END_HOUR: z.coerce.number().int().min(13).max(17).default(15),

  // --- Security ---
  SESSION_SECRET: z.string().min(32).default("dev-only-session-secret-change-me-0123456789"),
  UNSUBSCRIBE_HMAC_SECRET: z.string().min(32).default("dev-only-unsub-secret-change-me-0123456789"),
  DASHBOARD_BASE_URL: z.string().url().default("http://localhost:3000"),

  // --- Operational ---
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PREVIEW_EXPIRY_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  RETENTION_REJECTED_DAYS: z.coerce.number().int().min(1).default(90),
  VAR_DIR: z.string().default("var"),
  TZ_REGION: z.string().default("Europe/London"),
});

export type Env = z.infer<typeof envSchema>;

export interface AgencyIdentity {
  name: string;
  website: string;
  phone: string;
  postalAddress: string;
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Configuration error: ${message}`);
    this.name = "ConfigError";
  }
}

export function agencyIdentityComplete(env: Env): boolean {
  return Boolean(
    env.AGENCY_NAME &&
      env.AGENCY_WEBSITE &&
      env.AGENCY_PHONE &&
      env.AGENCY_POSTAL_ADDRESS &&
      env.AGENCY_SENDER_NAME &&
      env.AGENCY_SENDER_EMAIL &&
      env.AGENCY_REPLY_TO_EMAIL,
  );
}

const CREDENTIAL_REQUIREMENTS: Array<{
  adapter: keyof Env;
  keys: Array<keyof Env>;
}> = [
  { adapter: "DIRECTORY_ADAPTER", keys: ["GOOGLE_PLACES_API_KEY"] },
  { adapter: "REGISTRY_ADAPTER", keys: ["COMPANIES_HOUSE_API_KEY"] },
  { adapter: "EMAIL_VALIDATION_ADAPTER", keys: ["EMAIL_VALIDATION_API_KEY"] },
  { adapter: "DEPLOY_ADAPTER", keys: ["NETLIFY_API_TOKEN"] },
  { adapter: "EMAIL_PROVIDER_ADAPTER", keys: ["POSTMARK_SERVER_TOKEN"] },
];

/** Parse and cross-validate the environment. Throws ConfigError on invalid combinations. */
export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty-string variables as unset. Sourcing a .env file with blank values
  // (e.g. `EMAIL_VALIDATION_API_URL=`) exports "" — which must not fail url/format
  // validation for optional fields, and must fall through to defaults elsewhere.
  const cleaned: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== "") cleaned[key] = value;
  }
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const env = parsed.data;

  for (const req of CREDENTIAL_REQUIREMENTS) {
    if (env[req.adapter] === "real") {
      for (const key of req.keys) {
        if (!env[key]) {
          throw new ConfigError(`${String(req.adapter)}=real requires ${String(key)} to be set`);
        }
      }
    }
  }

  // LLM credentials depend on the selected provider.
  if (env.LLM_ADAPTER === "real") {
    if (env.LLM_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) {
      throw new ConfigError("LLM_ADAPTER=real with LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
    }
    if (env.LLM_PROVIDER === "openai-compatible") {
      if (!env.OPENAI_COMPAT_BASE_URL || !env.OPENAI_COMPAT_MODEL) {
        throw new ConfigError(
          "LLM_ADAPTER=real with LLM_PROVIDER=openai-compatible requires OPENAI_COMPAT_BASE_URL and OPENAI_COMPAT_MODEL (OPENAI_COMPAT_API_KEY optional for local endpoints)",
        );
      }
    }
  }

  if (env.APP_ENV === "production") {
    const mocks = CREDENTIAL_REQUIREMENTS.filter((r) => env[r.adapter] === "mock").map((r) =>
      String(r.adapter),
    );
    if (mocks.length > 0) {
      throw new ConfigError(
        `APP_ENV=production refuses to run with mock adapters: ${mocks.join(", ")}`,
      );
    }
    if (!agencyIdentityComplete(env)) {
      throw new ConfigError(
        "APP_ENV=production requires the full agency identity (AGENCY_NAME, AGENCY_WEBSITE, AGENCY_PHONE, AGENCY_POSTAL_ADDRESS, AGENCY_SENDER_NAME, AGENCY_SENDER_EMAIL, AGENCY_REPLY_TO_EMAIL)",
      );
    }
    if (env.SESSION_SECRET.startsWith("dev-only") || env.UNSUBSCRIBE_HMAC_SECRET.startsWith("dev-only")) {
      throw new ConfigError("APP_ENV=production requires non-default SESSION_SECRET and UNSUBSCRIBE_HMAC_SECRET");
    }
  }

  return env;
}

/**
 * Whether a real outbound email may be transmitted right now.
 * Every condition is required; there is no override path in code.
 */
export function sendingAllowed(env: Env): { allowed: boolean; reason?: string } {
  if (env.EMAIL_KILL_SWITCH) return { allowed: false, reason: "EMAIL_KILL_SWITCH is on" };
  if (env.EMAIL_DRY_RUN) return { allowed: false, reason: "EMAIL_DRY_RUN is on (default)" };
  if (env.EMAIL_PROVIDER_ADAPTER !== "real") {
    return { allowed: false, reason: "email provider adapter is mock" };
  }
  if (!agencyIdentityComplete(env)) return { allowed: false, reason: "agency identity incomplete" };
  if (!env.EMAIL_DOMAIN_AUTH_CONFIRMED) {
    return { allowed: false, reason: "EMAIL_DOMAIN_AUTH_CONFIRMED not asserted (SPF/DKIM/DMARC)" };
  }
  return { allowed: true };
}

export function agencyIdentity(env: Env): AgencyIdentity {
  return {
    name: env.AGENCY_NAME || "[AGENCY NAME NOT CONFIGURED]",
    website: env.AGENCY_WEBSITE || "[AGENCY WEBSITE NOT CONFIGURED]",
    phone: env.AGENCY_PHONE || "[AGENCY PHONE NOT CONFIGURED]",
    postalAddress: env.AGENCY_POSTAL_ADDRESS || "[AGENCY ADDRESS NOT CONFIGURED]",
    senderName: env.AGENCY_SENDER_NAME || "[SENDER NAME NOT CONFIGURED]",
    senderEmail: env.AGENCY_SENDER_EMAIL || "no-reply@invalid.local",
    replyToEmail: env.AGENCY_REPLY_TO_EMAIL || "no-reply@invalid.local",
  };
}
