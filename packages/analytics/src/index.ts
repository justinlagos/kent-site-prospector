import type { PrismaClient } from "@ksp/database";
import { londonDateString } from "@ksp/shared";

/** Daily and weekly report builders. Pure reads; rendering is plain text + JSON. */

export interface DailyReport {
  runDate: string;
  territory: string | null;
  category: string | null;
  discovered: number;
  rejected: number;
  rejectionReasons: Record<string, number>;
  selected: Array<{ businessId: string; name: string; score: number | null; previewUrl: string | null; emailStatus: string | null }>;
  emailsSent: number;
  errors: string[];
  repliesReceived: number;
  optOuts: number;
  conversionChanges: number;
}

export async function buildDailyReport(prisma: PrismaClient, runDate: string): Promise<DailyReport> {
  const run = await prisma.automationRun.findUnique({
    where: { runDate_runType: { runDate, runType: "daily-pipeline" } },
    include: { stages: true },
  });

  const dayStart = new Date(`${runDate}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 36 * 3600_000);

  const selectedIds = (run?.selectedBusinesses as string[] | null) ?? [];
  const selected = [];
  for (const id of selectedIds) {
    const b = await prisma.business.findUnique({
      where: { id },
      include: {
        scores: { orderBy: { calculatedAt: "desc" }, take: 1 },
        concepts: { orderBy: { createdAt: "desc" }, take: 1 },
        outreachEmails: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (b) {
      selected.push({
        businessId: b.id,
        name: b.name,
        score: b.scores[0]?.totalScore ?? null,
        previewUrl: b.concepts[0]?.previewUrl ?? null,
        emailStatus: b.outreachEmails[0]?.status ?? null,
      });
    }
  }

  const scoresToday = await prisma.prospectScore.findMany({
    where: { calculatedAt: { gte: dayStart, lte: dayEnd } },
  });
  const rejectionReasons: Record<string, number> = {};
  for (const s of scoresToday.filter((s) => s.disqualified)) {
    const key = s.disqualificationReason ?? "unspecified";
    rejectionReasons[key] = (rejectionReasons[key] ?? 0) + 1;
  }

  const discoveredToday = await prisma.business.count({
    where: { discoveredAt: { gte: dayStart, lte: dayEnd } },
  });
  const territoryStage = run?.stages.find((s) => s.name === "select-territory");
  const detail = (territoryStage?.detail ?? {}) as Record<string, unknown>;

  return {
    runDate,
    territory: (detail.town as string) ?? null,
    category: (detail.categoryLabel as string) ?? null,
    discovered: discoveredToday,
    rejected: scoresToday.filter((s) => s.disqualified).length,
    rejectionReasons,
    selected,
    emailsSent: await prisma.outreachEmail.count({
      where: { sentAt: { gte: dayStart, lte: dayEnd }, status: { in: ["SENT", "DELIVERED", "REPLIED"] } },
    }),
    errors: ((run?.errors as string[] | null) ?? []).slice(0, 20),
    repliesReceived: await prisma.outreachEmail.count({ where: { repliedAt: { gte: dayStart, lte: dayEnd } } }),
    optOuts: await prisma.suppression.count({
      where: { createdAt: { gte: dayStart, lte: dayEnd }, reason: "UNSUBSCRIBED" },
    }),
    conversionChanges: await prisma.conversion.count({
      where: { updatedAt: { gte: dayStart, lte: dayEnd } },
    }),
  };
}

export interface WeeklyReport {
  weekEnding: string;
  discovered: number;
  qualified: number;
  conceptsDeployed: number;
  emailsDelivered: number;
  replies: number;
  positiveReplies: number;
  meetings: number;
  proposals: number;
  wins: number;
  revenueWon: string;
  bounceRate: number;
  optOutRate: number;
  bestTowns: Array<{ town: string; replies: number }>;
  bestCategories: Array<{ category: string; replies: number }>;
  commonWeaknesses: Record<string, number>;
  recommendations: string[];
}

export async function buildWeeklyReport(prisma: PrismaClient, weekEndDate: Date): Promise<WeeklyReport> {
  const end = weekEndDate;
  const start = new Date(end.getTime() - 7 * 86_400_000);
  const inWeek = { gte: start, lte: end };

  const sent = await prisma.outreachEmail.count({ where: { sentAt: inWeek } });
  const bounced = await prisma.outreachEmail.count({ where: { bouncedAt: inWeek } });
  const optOuts = await prisma.suppression.count({ where: { createdAt: inWeek, reason: "UNSUBSCRIBED" } });

  const replies = await prisma.outreachEmail.findMany({
    where: { repliedAt: inWeek },
    include: { business: { include: { category: true } } },
  });
  const byTown: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const r of replies) {
    byTown[r.business.town] = (byTown[r.business.town] ?? 0) + 1;
    byCategory[r.business.category.label] = (byCategory[r.business.category.label] ?? 0) + 1;
  }

  const audits = await prisma.websiteAudit.findMany({ where: { auditDate: inWeek } });
  const commonWeaknesses: Record<string, number> = {};
  for (const a of audits) {
    const f = a.findingsJson as Record<string, unknown>;
    if (f.viewportMetaPresent === false) commonWeaknesses["not mobile responsive"] = (commonWeaknesses["not mobile responsive"] ?? 0) + 1;
    if (f.hasCallToAction === false) commonWeaknesses["no clear call to action"] = (commonWeaknesses["no clear call to action"] ?? 0) + 1;
    if (f.https === false) commonWeaknesses["no https"] = (commonWeaknesses["no https"] ?? 0) + 1;
    if (f.metaDescriptionMissing === true) commonWeaknesses["missing meta description"] = (commonWeaknesses["missing meta description"] ?? 0) + 1;
    if (f.hasWebsite === false) commonWeaknesses["no website"] = (commonWeaknesses["no website"] ?? 0) + 1;
  }

  const wonRows = await prisma.conversion.findMany({ where: { stage: "WON", updatedAt: inWeek } });
  const revenue = wonRows.reduce((acc, c) => acc + Number(c.actualValue ?? 0), 0);

  const recommendations: string[] = [];
  if (sent > 0 && bounced / sent > 0.05) recommendations.push("Bounce rate above 5% — review email validation provider settings");
  if (replies.length === 0 && sent >= 6) recommendations.push("No replies this week — review email observations and preview quality");
  const topWeakness = Object.entries(commonWeaknesses).sort((a, b) => b[1] - a[1])[0];
  if (topWeakness) recommendations.push(`Most common weakness: "${topWeakness[0]}" — consider leading concepts with this fix`);

  return {
    weekEnding: londonDateString(end),
    discovered: await prisma.business.count({ where: { discoveredAt: inWeek } }),
    qualified: await prisma.prospectScore.count({ where: { calculatedAt: inWeek, disqualified: false } }),
    conceptsDeployed: await prisma.concept.count({ where: { deployedAt: inWeek } }),
    emailsDelivered: await prisma.outreachEmail.count({ where: { deliveredAt: inWeek } }),
    replies: replies.length,
    positiveReplies: await prisma.conversion.count({ where: { stage: "POSITIVE_REPLY", createdAt: inWeek } }),
    meetings: await prisma.conversion.count({ where: { stage: "MEETING", createdAt: inWeek } }),
    proposals: await prisma.conversion.count({ where: { stage: "PROPOSAL", createdAt: inWeek } }),
    wins: wonRows.length,
    revenueWon: `£${revenue.toFixed(2)}`,
    bounceRate: sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : 0,
    optOutRate: sent > 0 ? Math.round((optOuts / sent) * 1000) / 10 : 0,
    bestTowns: Object.entries(byTown).map(([town, r]) => ({ town, replies: r })).sort((a, b) => b.replies - a.replies).slice(0, 5),
    bestCategories: Object.entries(byCategory).map(([category, r]) => ({ category, replies: r })).sort((a, b) => b.replies - a.replies).slice(0, 5),
    commonWeaknesses,
    recommendations,
  };
}

export function renderDailyReportText(r: DailyReport): string {
  return [
    `KENT SITE PROSPECTOR — Daily report ${r.runDate}`,
    `Territory: ${r.territory ?? "-"} | Category: ${r.category ?? "-"}`,
    `Discovered: ${r.discovered} | Rejected: ${r.rejected} | Emails sent: ${r.emailsSent}`,
    `Rejections: ${Object.entries(r.rejectionReasons).map(([k, v]) => `${k} (${v})`).join("; ") || "none"}`,
    `Selected:`,
    ...r.selected.map((s) => `  - ${s.name} | score ${s.score ?? "-"} | ${s.previewUrl ?? "no preview"} | email ${s.emailStatus ?? "-"}`),
    `Replies: ${r.repliesReceived} | Opt-outs: ${r.optOuts} | Conversion changes: ${r.conversionChanges}`,
    r.errors.length ? `Errors:\n${r.errors.map((e) => `  ! ${e}`).join("\n")}` : "Errors: none",
  ].join("\n");
}
