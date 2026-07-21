import type { PrismaClient, Prisma, ComplianceDecision, LegalForm } from "@ksp/database";
import { audit } from "@ksp/database";
import { emailDomain, type Logger } from "@ksp/shared";

/**
 * Compliance decision engine.
 *
 * Only CORPORATE_APPROVED prospects may enter the automated outreach queue.
 * The rules implement UK PECR reg. 22 (unsolicited marketing email): corporate
 * subscribers (incorporated bodies) may be emailed under legitimate interests with
 * sender identification and opt-out; individual subscribers (sole traders, ordinary
 * partnerships) require prior consent, which this system does not collect — so they
 * are never auto-approved.
 *
 * Decision order matters: suppression is checked first and always wins.
 */

export interface ComplianceInput {
  businessId: string;
  actor?: string;
  /** privacy notice version in force (from PolicyDocument) */
  privacyNoticeVersion: string;
  liaReference?: string;
}

export interface ComplianceOutcome {
  decision: ComplianceDecision;
  reason: string;
  recordId: string;
}

const CORPORATE_FORMS: LegalForm[] = ["LTD", "LLP", "PLC", "CHARITY"];

export async function evaluateProspect(
  prisma: PrismaClient,
  logger: Logger,
  input: ComplianceInput,
): Promise<ComplianceOutcome> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: input.businessId },
    include: { contacts: true },
  });

  const decide = async (
    decision: ComplianceDecision,
    reason: string,
    lawfulBasis: "LEGITIMATE_INTERESTS" | "CONSENT" | "NONE" = "NONE",
  ): Promise<ComplianceOutcome> => {
    const record = await prisma.complianceRecord.create({
      data: {
        businessId: business.id,
        legalForm: business.legalForm,
        decision,
        lawfulBasis,
        legitimateInterestAssessmentId: input.liaReference ?? null,
        privacyNoticeVersion: input.privacyNoticeVersion,
        sourceOfPersonalData: business.discoverySource,
        decisionReason: reason,
      },
    });
    await audit(prisma, input.actor ?? "system", "compliance.decision", "Business", business.id, {
      decision,
      reason,
    });
    logger.info("compliance decision", { businessId: business.id, decision, reason });
    return { decision, reason, recordId: record.id };
  };

  // 1. Suppression always wins.
  const contactEmails = business.contacts.map((c) => c.email.toLowerCase());
  const domains = [...new Set(contactEmails.map(emailDomain))].filter(Boolean);
  const suppression = await prisma.suppression.findFirst({
    where: {
      reversedAt: null,
      OR: [
        { businessId: business.id },
        ...(contactEmails.length ? [{ email: { in: contactEmails } }] : []),
        ...(domains.length ? [{ domain: { in: domains } }] : []),
      ],
    },
  });
  if (suppression) {
    return decide("SUPPRESSED", `Active suppression ${suppression.id} (${suppression.reason})`);
  }

  // 2. Legal form gating.
  if (business.legalForm === "SOLE_TRADER" || business.legalForm === "PARTNERSHIP") {
    return decide(
      "CONSENT_REQUIRED",
      "Individual subscriber under PECR (sole trader / ordinary partnership): automated unsolicited email prohibited without recorded consent",
    );
  }
  if (business.legalForm === "PUBLIC_BODY") {
    return decide("DO_NOT_CONTACT", "Public bodies excluded unless explicitly enabled");
  }
  if (business.legalForm === "UNKNOWN") {
    return decide(
      "MANUAL_REVIEW_REQUIRED",
      "Legal form could not be confirmed via Companies House; manual classification required before any outreach",
    );
  }
  if (!CORPORATE_FORMS.includes(business.legalForm)) {
    return decide("MANUAL_REVIEW_REQUIRED", `Unhandled legal form ${business.legalForm}`);
  }

  // 3. Company status must be active where known.
  if (business.companyStatus && business.companyStatus !== "active") {
    return decide("DO_NOT_CONTACT", `Company status is ${business.companyStatus}`);
  }

  // 4. Identity confidence: corporate approval requires a Companies House match.
  if (!business.companyNumber) {
    return decide("IDENTITY_UNCONFIRMED", "No Companies House company number on record");
  }

  // 5. Contact route: a validated, non-personal email is required for automation.
  const usable = business.contacts.filter(
    (c) => c.validationStatus === "VALID" && c.emailType !== "PERSONAL",
  );
  if (usable.length === 0) {
    const anyValidated = business.contacts.some((c) => c.validationStatus === "VALID");
    return decide(
      "EMAIL_UNVERIFIED",
      anyValidated
        ? "Only personal addresses available; automated use not permitted by policy"
        : "No validated generic/role email address",
    );
  }

  // 6. Chain exclusion (unless enabled in settings).
  const chainSetting = await prisma.setting.findUnique({ where: { key: "chainBusinessesEnabled" } });
  const chainsEnabled = chainSetting?.value === true;
  if (business.isChain && !chainsEnabled) {
    return decide("DO_NOT_CONTACT", "Chain businesses disabled in settings");
  }

  return decide(
    "CORPORATE_APPROVED",
    `Active ${business.legalForm} (${business.companyNumber}) with validated generic contact route`,
    "LEGITIMATE_INTERESTS",
  );
}

/** Latest decision for a business, or null. */
export async function latestDecision(
  db: PrismaClient | Prisma.TransactionClient,
  businessId: string,
): Promise<ComplianceDecision | null> {
  const rec = await db.complianceRecord.findFirst({
    where: { businessId },
    orderBy: { checkedAt: "desc" },
    select: { decision: true },
  });
  return rec?.decision ?? null;
}
