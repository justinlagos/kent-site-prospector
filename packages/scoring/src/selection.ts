import type { PrismaClient } from "@ksp/database";
import { normalisePostcode, type Logger } from "@ksp/shared";

/**
 * Select the day's two strongest eligible prospects.
 *
 * Eligibility (all enforced again downstream — defence in depth):
 *  - latest ProspectScore not disqualified, totalScore >= minProspectScore
 *  - latest ComplianceRecord decision == CORPORATE_APPROVED
 *  - no active suppression
 *  - never previously contacted
 *
 * Same-day competitor spacing: two businesses in the same category are not both
 * selected when their full postcodes share the same sector (e.g. "ME14 5"), a
 * practical proxy for "extremely close" without a geocoding dependency.
 */
export async function selectDailyPair(
  prisma: PrismaClient,
  logger: Logger,
  opts: { candidateBusinessIds: string[]; minScore: number; limit?: number },
): Promise<string[]> {
  const limit = opts.limit ?? 2;
  const ranked: Array<{ id: string; score: number; categoryId: string; sector: string }> = [];

  for (const id of opts.candidateBusinessIds) {
    const score = await prisma.prospectScore.findFirst({
      where: { businessId: id },
      orderBy: { calculatedAt: "desc" },
    });
    if (!score || score.disqualified || score.totalScore < opts.minScore) continue;

    const compliance = await prisma.complianceRecord.findFirst({
      where: { businessId: id },
      orderBy: { checkedAt: "desc" },
    });
    if (compliance?.decision !== "CORPORATE_APPROVED") continue;

    const suppressed = await prisma.suppression.findFirst({
      where: { businessId: id, reversedAt: null },
      select: { id: true },
    });
    if (suppressed) continue;

    const contacted = await prisma.outreachEmail.findFirst({
      where: { businessId: id, status: { notIn: ["CANCELLED", "BLOCKED"] } },
      select: { id: true },
    });
    if (contacted) continue;

    const business = await prisma.business.findUniqueOrThrow({
      where: { id },
      select: { categoryId: true, postcode: true },
    });
    const pc = normalisePostcode(business.postcode);
    const sector = pc.includes(" ") ? pc.split(" ")[0] + " " + (pc.split(" ")[1]?.[0] ?? "") : pc;

    ranked.push({ id, score: score.totalScore, categoryId: business.categoryId, sector });
  }

  ranked.sort((a, b) => b.score - a.score);

  const selected: typeof ranked = [];
  for (const candidate of ranked) {
    if (selected.length >= limit) break;
    const clash = selected.some(
      (s) => s.categoryId === candidate.categoryId && s.sector === candidate.sector,
    );
    if (clash) {
      logger.info("selection skipped close competitor", { businessId: candidate.id, sector: candidate.sector });
      continue;
    }
    selected.push(candidate);
  }

  const ids = selected.map((s) => s.id);
  await prisma.business.updateMany({ where: { id: { in: ids } }, data: { status: "SELECTED" } });
  logger.info("daily selection complete", { selected: ids, consideredCount: ranked.length });
  return ids;
}
