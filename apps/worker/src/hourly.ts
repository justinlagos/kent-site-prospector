import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@ksp/database";
import { audit } from "@ksp/database";
import { Env, londonDateString, londonParts, systemClock, type LondonClock, type Logger } from "@ksp/shared";
import { processScheduledSends } from "@ksp/email";
import { unpublishExpiredConcepts } from "@ksp/deployment";
import { buildWeeklyReport } from "@ksp/analytics";
import type { Adapters } from "./adapters.js";

/**
 * Hourly events job: due sends, preview expiry, retention sweep, Friday weekly report.
 * Every operation is idempotent, so overlapping/missed invocations are safe.
 */
export async function runHourlyEvents(
  prisma: PrismaClient,
  env: Env,
  adapters: Adapters,
  logger: Logger,
  clock: LondonClock = systemClock,
): Promise<void> {
  await processScheduledSends(prisma, env, adapters.emailProvider, logger, clock);
  await unpublishExpiredConcepts(prisma, adapters.deployer, logger);
  await retentionSweep(prisma, env, logger);

  const parts = londonParts(clock.now());
  if (parts.weekday === 5 && parts.hour >= 16) {
    const weekEnding = londonDateString(clock.now());
    const existing = await prisma.automationRun.findUnique({
      where: { runDate_runType: { runDate: weekEnding, runType: "weekly-report" } },
    });
    if (!existing) {
      const report = await buildWeeklyReport(prisma, clock.now());
      const varDir = path.resolve(env.VAR_DIR);
      await mkdir(path.join(varDir, "reports"), { recursive: true });
      await writeFile(
        path.join(varDir, "reports", `weekly-${weekEnding}.json`),
        JSON.stringify(report, null, 2),
      );
      await prisma.automationRun.create({
        data: {
          runDate: weekEnding,
          runType: "weekly-report",
          status: "COMPLETED",
          completedAt: new Date(),
          logs: JSON.parse(JSON.stringify(report)),
        },
      });
      logger.info("weekly report generated", { weekEnding });
    }
  }
}

/**
 * Retention sweep: anonymise personal data on rejected/never-contacted prospects after
 * the configured window. Business-identity data and the dedup fingerprint are retained
 * (corporate data, and required so the business is not re-imported and re-processed).
 */
export async function retentionSweep(prisma: PrismaClient, env: Env, logger: Logger): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { key: "retentionRejectedDays" } });
  const days = typeof setting?.value === "number" ? setting.value : env.RETENTION_REJECTED_DAYS;
  const cutoff = new Date(Date.now() - days * 86_400_000);

  const due = await prisma.business.findMany({
    where: {
      status: "DISQUALIFIED",
      discoveredAt: { lt: cutoff },
      outreachEmails: { none: {} },
    },
    select: { id: true },
    take: 200,
  });

  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      await tx.contact.deleteMany({ where: { businessId: id } });
      await tx.business.update({
        where: { id },
        data: { phone: null, primaryEmail: null, socialProfiles: undefined, status: "ANONYMISED" },
      });
      await audit(tx, "system", "retention.anonymised", "Business", id, { afterDays: days });
    });
  }
  if (due.length > 0) logger.info("retention sweep anonymised prospects", { count: due.length });
  return due.length;
}
