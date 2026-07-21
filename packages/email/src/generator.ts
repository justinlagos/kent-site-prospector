import { z } from "zod";
import { FatalError, LlmAdapter, type AgencyIdentity, type Logger } from "@ksp/shared";
import type { ResearchBrief } from "@ksp/research";
import { EMAIL_COPY_SYSTEM, emailCopyUserPrompt } from "@ksp/research";
import { validateClaims } from "@ksp/content-generation";

/**
 * Per-prospect email generation. Every email is generated individually from that
 * prospect's audit evidence and research brief — no shared boilerplate body — then
 * passed through the claims firewall before it can be stored, let alone sent.
 */

const emailCopySchema = z.object({
  subject: z.string().min(8).max(90),
  observationPositive: z.string().min(5),
  observationOpportunity: z.string().min(5),
  bodyText: z.string().min(200).max(1600),
});

export interface GeneratedEmail {
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

export interface EmailGenerationInput {
  brief: ResearchBrief;
  businessName: string;
  town: string;
  categoryLabel: string;
  previewUrl: string;
  unsubscribeUrl: string;
  agency: AgencyIdentity;
  /** objective, evidence-backed strings from the audit — the LLM may only pick from these */
  positiveSignals: string[];
  objectiveWeaknesses: string[];
}

const BANNED_EMAIL_PATTERNS: Array<[string, RegExp]> = [
  ["false-urgency", /\b(limited time|act now|today only|don't miss|last chance|expires (soon|today))\b/i],
  ["revenue-promise", /\b(double|triple|10x|guarantee[ds]? (more|new)|skyrocket|boost your (sales|revenue) by)\b/i],
  ["customer-impersonation", /\b(as a customer|i tried to book|i was looking to buy)\b/i],
  ["shaming", /\b(embarrassing|terrible|awful|ugly|unprofessional|amateur)\b/i],
  ["broken-claim", /\bwebsite is broken\b/i],
];

export async function generateOutreachEmail(
  llm: LlmAdapter,
  logger: Logger,
  input: EmailGenerationInput,
): Promise<GeneratedEmail> {
  const llmInput = {
    businessName: input.businessName,
    town: input.town,
    categoryLabel: input.categoryLabel,
    positiveSignals: input.positiveSignals,
    objectiveWeaknesses: input.objectiveWeaknesses,
    verifiedFacts: input.brief.verifiedFacts,
  };

  const raw = await llm.complete({
    system: EMAIL_COPY_SYSTEM,
    user: emailCopyUserPrompt(JSON.stringify(llmInput, null, 2)),
    jsonResponse: true,
    maxTokens: 1200,
    temperature: 0.6,
  });
  const parsed = emailCopySchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new FatalError("EMAIL_SCHEMA", `Email copy failed validation: ${parsed.error.message.slice(0, 300)}`);
  }
  const copy = parsed.data;

  // Claims firewall + banned-pattern scan on the model-authored body.
  const violations = validateClaims(`${copy.subject}\n${copy.bodyText}`, input.brief);
  if (violations.length > 0) {
    throw new FatalError(
      "EMAIL_CLAIMS",
      `Email copy contains unverified claims: ${violations.map((v) => v.rule).join(", ")}`,
    );
  }
  for (const [name, re] of BANNED_EMAIL_PATTERNS) {
    if (re.test(copy.bodyText) || re.test(copy.subject)) {
      throw new FatalError("EMAIL_BANNED_PATTERN", `Email copy violates policy: ${name}`);
    }
  }

  const a = input.agency;
  const bodyText = `Hello ${input.businessName} team,

${copy.bodyText.trim()}

You can view the private concept here:
${input.previewUrl}

This is only a design proposal and is not connected to your official website. There is no obligation to use it. You're receiving this one-off email because ${input.businessName} publishes this business contact address; we contacted you as a corporate subscriber about a service relevant to your business.

Regards,

${a.senderName}
${a.name}
${a.website}
${a.phone}
${a.postalAddress}

Not relevant? Opt out here (one click, permanent): ${input.unsubscribeUrl}
`;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const bodyHtml = `<!doctype html><html lang="en-GB"><body style="font-family:system-ui,sans-serif;color:#1a202c;line-height:1.6;max-width:38rem;margin:0 auto;padding:16px">
<p>Hello ${esc(input.businessName)} team,</p>
${copy.bodyText
    .trim()
    .split(/\n\n+/)
    .map((para) => `<p>${esc(para)}</p>`)
    .join("\n")}
<p><a href="${esc(input.previewUrl)}">View the private concept</a></p>
<p style="font-size:13px;color:#4a5568">This is only a design proposal and is not connected to your official website. There is no obligation to use it. You're receiving this one-off email because ${esc(input.businessName)} publishes this business contact address; we contacted you as a corporate subscriber about a service relevant to your business.</p>
<p>Regards,<br/>${esc(a.senderName)}<br/>${esc(a.name)}<br/><a href="${esc(a.website)}">${esc(a.website)}</a><br/>${esc(a.phone)}<br/>${esc(a.postalAddress)}</p>
<p style="font-size:13px"><a href="${esc(input.unsubscribeUrl)}">Not relevant? Opt out here (one click, permanent)</a></p>
</body></html>`;

  logger.info("outreach email generated", { subjectLength: copy.subject.length });
  return { subject: copy.subject, bodyText, bodyHtml };
}

/** Build the objective evidence lists the LLM may draw from — derived, never invented. */
export function auditEvidenceForEmail(
  findings: Record<string, unknown>,
  business: { reviewCount: number | null; reviewRating: number | null },
): { positiveSignals: string[]; objectiveWeaknesses: string[] } {
  const positives: string[] = [];
  const weaknesses: string[] = [];

  if (business.reviewCount && business.reviewRating && business.reviewCount > 10 && business.reviewRating >= 4.2) {
    positives.push(`a strong public review record (${business.reviewCount} reviews averaging ${business.reviewRating.toFixed(1)}/5)`);
  }
  if (findings.hasWebsite === false) {
    weaknesses.push("no website appears in the main business listings, so customers can only find a phone number");
    positives.push("an active, findable business profile");
    return { positiveSignals: positives, objectiveWeaknesses: weaknesses };
  }
  if (findings.reachable === true) positives.push("an established web presence");
  if (findings.contactInfoVisible === true) positives.push("clearly published contact details");

  if (findings.viewportMetaPresent === false) weaknesses.push("the current site doesn't adapt for mobile screens, where most local searches happen");
  if (findings.hasCallToAction === false) weaknesses.push("there's no clear next step (like a booking or enquiry button) when a visitor lands on the page");
  if (findings.https === false) weaknesses.push("the site is served without HTTPS, so browsers mark it 'not secure'");
  if (findings.metaDescriptionMissing === true) weaknesses.push("the page is missing the short description search engines show under the business name");
  if (findings.copyrightOutdated === true) weaknesses.push("the site footer shows an older copyright year, which can read as inactive");
  if (typeof findings.loadTimeMs === "number" && findings.loadTimeMs > 4000) {
    weaknesses.push("the homepage takes several seconds to load on a normal connection");
  }
  if (weaknesses.length === 0) weaknesses.push("the enquiry journey could be shorter and clearer for mobile visitors");
  if (positives.length === 0) positives.push("an established local presence");

  return { positiveSignals: positives, objectiveWeaknesses: weaknesses };
}
