import type { PrismaClient } from "@ksp/database";
import { type Logger } from "@ksp/shared";

export const SCORING_VERSION = "1.0.0";

/**
 * Weighted prospect scoring model (0–100):
 *   websiteWeakness        25  — from audit opportunityScore
 *   commercialPotential    20  — category demand + review volume proxy
 *   enquiryBenefit         15  — how directly a better site converts to bookings/enquiries
 *   businessActivity       10  — operational signals (reviews recency proxy, hours)
 *   reviewStrength         10  — rating quality (a good reputation with a bad site = ideal)
 *   contactability         10  — validated generic email + phone
 *   companyStatusConfidence 5  — Companies House match confidence
 *   brandInfoAvailability   5  — enough verified material to build a credible concept
 */
export interface ComponentScores {
  websiteWeakness: number;
  commercialPotential: number;
  enquiryBenefit: number;
  businessActivity: number;
  reviewStrength: number;
  contactability: number;
  companyStatusConfidence: number;
  brandInfoAvailability: number;
}

const HIGH_INTENT_STRATEGIES = new Set([
  "dental-clinic",
  "medical-clinic",
  "beauty",
  "trades",
  "automotive",
  "estate-agency",
  "legal-services",
  "removals",
]);

export interface DisqualificationCheck {
  disqualified: boolean;
  reason?: string;
}

export async function disqualify(
  prisma: PrismaClient,
  businessId: string,
): Promise<DisqualificationCheck> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    include: {
      contacts: true,
      audits: { orderBy: { auditDate: "desc" }, take: 1 },
      outreachEmails: { where: { status: { notIn: ["CANCELLED", "BLOCKED"] } }, take: 1 },
      suppressions: { where: { reversedAt: null }, take: 1 },
      category: true,
    },
  });

  if (business.status === "DISQUALIFIED") return { disqualified: true, reason: "previously disqualified" };
  if (business.suppressions.length > 0) return { disqualified: true, reason: "on suppression list" };
  if (business.outreachEmails.length > 0) return { disqualified: true, reason: "already contacted" };
  if (business.companyStatus && business.companyStatus !== "active") {
    return { disqualified: true, reason: `company status ${business.companyStatus}` };
  }
  const hasContactRoute =
    business.contacts.some((c) => c.validationStatus === "VALID" && c.emailType !== "PERSONAL");
  if (!hasContactRoute) return { disqualified: true, reason: "no reliable contact route" };

  const audit = business.audits[0];
  if (!audit) return { disqualified: true, reason: "no website audit available" };
  // Threshold is operator-tunable (dashboard Settings -> minOpportunityScore).
  // Real-world sites score tighter than synthetic ones, so the default is deliberately low.
  const minOppSetting = await prisma.setting.findUnique({ where: { key: "minOpportunityScore" } });
  const minOpportunity = typeof minOppSetting?.value === "number" ? minOppSetting.value : 15;
  if (audit.hasWebsite && audit.opportunityScore < minOpportunity) {
    return {
      disqualified: true,
      reason: `existing website is already strong (opportunity ${audit.opportunityScore} < ${minOpportunity})`,
    };
  }

  const chainSetting = await prisma.setting.findUnique({ where: { key: "chainBusinessesEnabled" } });
  if (business.isChain && chainSetting?.value !== true) {
    return { disqualified: true, reason: "chain business (disabled in settings)" };
  }
  if (business.legalForm === "PUBLIC_BODY") {
    const pbSetting = await prisma.setting.findUnique({ where: { key: "publicBodiesEnabled" } });
    if (pbSetting?.value !== true) return { disqualified: true, reason: "public body (disabled in settings)" };
  }
  return { disqualified: false };
}

export async function scoreProspect(
  prisma: PrismaClient,
  logger: Logger,
  businessId: string,
): Promise<{ totalScore: number; components: ComponentScores; disqualified: boolean; reason?: string }> {
  const dq = await disqualify(prisma, businessId);

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    include: {
      contacts: true,
      audits: { orderBy: { auditDate: "desc" }, take: 1 },
      category: true,
    },
  });
  const audit = business.audits[0];

  const scale = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));

  const components: ComponentScores = {
    websiteWeakness: scale(((audit?.opportunityScore ?? 0) / 100) * 25, 25),
    commercialPotential: scale(
      (HIGH_INTENT_STRATEGIES.has(business.category.strategyKey) ? 12 : 8) +
        Math.min(8, (business.reviewCount ?? 0) / 15),
      20,
    ),
    enquiryBenefit: scale(HIGH_INTENT_STRATEGIES.has(business.category.strategyKey) ? 15 : 10, 15),
    businessActivity: scale(
      (business.openingHours ? 4 : 0) + Math.min(6, (business.reviewCount ?? 0) / 10),
      10,
    ),
    reviewStrength: scale(
      business.reviewRating ? ((business.reviewRating - 3) / 2) * 8 + Math.min(2, (business.reviewCount ?? 0) / 50) : 0,
      10,
    ),
    contactability: scale(
      (business.contacts.some((c) => c.validationStatus === "VALID" && c.emailType === "GENERIC") ? 7 : 3) +
        (business.phone ? 3 : 0),
      10,
    ),
    companyStatusConfidence: scale(
      business.companyNumber ? (business.confidence === "HIGH" ? 5 : 3) : 0,
      5,
    ),
    brandInfoAvailability: scale(
      (business.website ? 2 : 0) + ((business.reviewCount ?? 0) > 5 ? 1 : 0) + (business.services ? 1 : 0) + (business.openingHours ? 1 : 0),
      5,
    ),
  };

  const totalScore = Object.values(components).reduce((a, b) => a + b, 0);

  await prisma.prospectScore.create({
    data: {
      businessId,
      totalScore,
      scoringVersion: SCORING_VERSION,
      componentScores: components as never,
      disqualified: dq.disqualified,
      disqualificationReason: dq.reason ?? null,
    },
  });
  await prisma.business.update({
    where: { id: businessId },
    data: { status: dq.disqualified ? "DISQUALIFIED" : "SCORED" },
  });

  logger.info("prospect scored", { businessId, totalScore, disqualified: dq.disqualified, reason: dq.reason });
  return { totalScore, components, disqualified: dq.disqualified, reason: dq.reason };
}
