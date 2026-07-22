/**
 * Adapter interfaces for every external integration.
 * Feature packages provide `real` and `mock` implementations; selection is config-driven.
 * Nothing outside an adapter may call an external network API.
 */

// ---------------------------------------------------------------------------
// Business discovery
// ---------------------------------------------------------------------------

export interface DiscoveredBusiness {
  providerPlaceId: string;
  name: string;
  tradingName?: string;
  address: string;
  postcode: string;
  town: string;
  phone?: string;
  /** Only emails published by the licensed source. Never guessed. */
  email?: string;
  website?: string;
  socialProfiles?: Record<string, string>;
  googleProfileUrl?: string;
  reviewCount?: number;
  reviewRating?: number;
  openingHours?: Record<string, string>;
  services?: string[];
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "UNKNOWN";
  sourceUrl?: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface DirectorySearchQuery {
  town: string;
  outwardPostcode: string;
  categoryLabel: string;
  providerTypes: string[];
  maxResults: number;
}

export interface BusinessDirectoryAdapter {
  readonly source: string;
  search(query: DirectorySearchQuery): Promise<DiscoveredBusiness[]>;
}

// ---------------------------------------------------------------------------
// Company registry (Companies House)
// ---------------------------------------------------------------------------

export type LegalForm =
  | "LTD"
  | "LLP"
  | "PLC"
  | "CHARITY"
  | "SOLE_TRADER"
  | "PARTNERSHIP"
  | "PUBLIC_BODY"
  | "UNKNOWN";

export interface CompanyMatch {
  companyNumber: string;
  legalName: string;
  legalForm: LegalForm;
  companyStatus: "active" | "dissolved" | "liquidation" | "other";
  registeredAddress?: string;
  matchConfidence: "HIGH" | "MEDIUM" | "LOW";
  sourceUrl: string;
}

export interface CompanyRegistryAdapter {
  readonly source: string;
  /** Search by business name, optionally narrowed by postcode/town. */
  findCompany(name: string, postcode?: string): Promise<CompanyMatch | null>;
}

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

export type EmailValidationVerdict = "VALID" | "INVALID" | "RISKY" | "UNKNOWN";

export interface EmailValidationAdapter {
  readonly source: string;
  validate(email: string): Promise<{ verdict: EmailValidationVerdict; detail?: string }>;
}

// ---------------------------------------------------------------------------
// LLM (research synthesis, copywriting, page generation)
// ---------------------------------------------------------------------------

export interface LlmCompletionRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** When set, the adapter instructs/parses strict JSON and validates it is parseable. */
  jsonResponse?: boolean;
}

export interface LlmAdapter {
  readonly source: string;
  complete(req: LlmCompletionRequest): Promise<string>;
}

// ---------------------------------------------------------------------------
// Image generation (tailored illustrative imagery for concepts)
// ---------------------------------------------------------------------------

export interface ImageGenRequest {
  /** Full prompt. Callers must keep prompts illustrative/generic — the pipeline's
   * prompt builder enforces: no identifiable people, no text/logos, and never a
   * depiction of the actual business premises, staff or results. */
  prompt: string;
  width: number;
  height: number;
  /** Deterministic variation per business so every concept looks distinct. */
  seed: number;
}

export interface GeneratedImage {
  data: Buffer;
  /** file extension without dot, e.g. "jpg" | "svg" */
  ext: string;
  provider: string;
}

export interface ImageGenAdapter {
  readonly source: string;
  generate(req: ImageGenRequest): Promise<GeneratedImage>;
}

// ---------------------------------------------------------------------------
// Deployment (Netlify)
// ---------------------------------------------------------------------------

export interface DeployRequest {
  slug: string; // must already be validated non-deceptive
  files: Record<string, string | Buffer>; // path -> content, includes robots.txt/_headers
  passwordProtect: boolean;
}

export interface DeployResult {
  deploymentId: string;
  siteId: string;
  url: string;
  logs: string;
}

export interface DeployAdapter {
  readonly source: string;
  deploy(req: DeployRequest): Promise<DeployResult>;
  /** Replace a deployment's content (used for the neutral expired page). */
  replace(siteId: string, files: Record<string, string | Buffer>): Promise<DeployResult>;
  delete(siteId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Email provider
// ---------------------------------------------------------------------------

export interface OutboundEmail {
  to: string;
  from: string; // "Name <email>"
  replyTo: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  headers: Record<string, string>; // includes List-Unsubscribe / List-Unsubscribe-Post
  /** Provider-level idempotency/tag reference — our OutreachEmail idempotencyKey. */
  reference: string;
}

export interface SendResult {
  providerMessageId: string;
  submittedAt: string;
}

export interface EmailProviderAdapter {
  readonly source: string;
  send(email: OutboundEmail): Promise<SendResult>;
  /** Look up a previously submitted message by our reference (reconciliation path). */
  findByReference(reference: string): Promise<SendResult | null>;
}
