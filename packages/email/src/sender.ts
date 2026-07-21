import type { PrismaClient } from "@ksp/database";
import { audit, withAdvisoryLock } from "@ksp/database";
import {
  ComplianceError,
  EmailProviderAdapter,
  Env,
  agencyIdentity,
  emailDomain,
  isLondonWeekday,
  isWithinLondonHours,
  londonDateString,
  outreachIdempotencyKey,
  pickSendTime,
  sendingAllowed,
  signUnsubscribeToken,
  type LondonClock,
  systemClock,
  type Logger,
} from "@ksp/shared";

/**
 * The send path. Layered controls, every one re-checked at the moment of send:
 *   1. Kill switch (env + DB setting)
 *   2. Weekday + UK business hours (Europe/London wall clock)
 *   3. Daily first-contact cap counted under a Postgres advisory lock
 *   4. Active suppression (email / domain / business)
 *   5. Latest compliance decision must be CORPORATE_APPROVED
 *   6. Contact validation must still be VALID
 *   7. Idempotency: unique DB key + provider reference reconciliation
 * Real transmission additionally requires sendingAllowed(env) unless the provider is a mock.
 */

export interface QueueEmailInput {
  businessId: string;
  contactId: string;
  conceptId: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  sequence?: number;
  runDate: string; // YYYY-MM-DD London
}

export async function queueOutreachEmail(
  prisma: PrismaClient,
  env: Env,
  logger: Logger,
  input: QueueEmailInput,
): Promise<{ outreachEmailId: string; scheduledAt: Date; created: boolean }> {
  const sequence = input.sequence ?? 1;
  if (sequence > 1) {
    const followUps = await prisma.setting.findUnique({ where: { key: "followUpsEnabled" } });
    if (followUps?.value !== true) {
      throw new ComplianceError("FOLLOWUPS_DISABLED", "Follow-up emails are disabled in settings");
    }
  }

  const idempotencyKey = outreachIdempotencyKey(input.businessId, input.contactId, sequence);
  const existing = await prisma.outreachEmail.findUnique({ where: { idempotencyKey } });
  if (existing) {
    logger.info("queue skipped: idempotency key exists", { idempotencyKey, status: existing.status });
    return { outreachEmailId: existing.id, scheduledAt: existing.scheduledAt ?? new Date(), created: false };
  }

  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: input.contactId } });
  const unsubscribeToken = signUnsubscribeToken(
    env.UNSUBSCRIBE_HMAC_SECRET,
    contact.email,
    input.businessId,
  );

  const { hour, minute } = pickSendTime(
    input.runDate,
    env.SEND_WINDOW_START_HOUR,
    env.SEND_WINDOW_END_HOUR,
    input.businessId,
  );
  // Construct the scheduled instant from London wall-clock date + chosen time.
  const scheduledAt = londonWallClockToDate(input.runDate, hour, minute);

  const row = await prisma.outreachEmail.create({
    data: {
      businessId: input.businessId,
      contactId: input.contactId,
      conceptId: input.conceptId,
      sequence,
      idempotencyKey,
      subject: input.subject,
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      status: "SCHEDULED",
      scheduledAt,
      unsubscribeToken,
    },
  });
  await audit(prisma, "system", "outreach.queued", "OutreachEmail", row.id, {
    scheduledAt: scheduledAt.toISOString(),
  });
  return { outreachEmailId: row.id, scheduledAt, created: true };
}

/** Convert a Europe/London date + time to a UTC Date (handles BST/GMT). */
export function londonWallClockToDate(dateStr: string, hour: number, minute: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Try both possible offsets (0 and 60 minutes); pick the one that round-trips.
  for (const offsetMin of [60, 0]) {
    const candidate = new Date(Date.UTC(y!, m! - 1, d!, hour, minute) - offsetMin * 60_000);
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      hour12: false,
    });
    if (Number(fmt.format(candidate)) % 24 === hour) return candidate;
  }
  return new Date(Date.UTC(y!, m! - 1, d!, hour, minute));
}

export interface SendCycleResult {
  sent: number;
  blocked: number;
  deferred: number;
  reconciled: number;
}

export async function processScheduledSends(
  prisma: PrismaClient,
  env: Env,
  provider: EmailProviderAdapter,
  logger: Logger,
  clock: LondonClock = systemClock,
): Promise<SendCycleResult> {
  const result: SendCycleResult = { sent: 0, blocked: 0, deferred: 0, reconciled: 0 };
  const now = clock.now();

  // Global halts.
  const killSetting = await prisma.setting.findUnique({ where: { key: "emailKillSwitch" } });
  if (env.EMAIL_KILL_SWITCH || killSetting?.value === true) {
    logger.warn("send cycle skipped: kill switch active");
    return result;
  }
  if (!isLondonWeekday(now)) {
    logger.info("send cycle skipped: not a UK weekday");
    return result;
  }
  if (!isWithinLondonHours(now, env.SEND_WINDOW_START_HOUR, env.SEND_WINDOW_END_HOUR)) {
    logger.info("send cycle skipped: outside send window");
    return result;
  }

  const isMockProvider = provider.source.startsWith("mock");
  if (!isMockProvider) {
    const gate = sendingAllowed(env);
    if (!gate.allowed) {
      logger.warn("send cycle skipped: real sending not allowed", { reason: gate.reason });
      return result;
    }
  }

  const due = await prisma.outreachEmail.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    include: { contact: true, business: true },
    orderBy: { scheduledAt: "asc" },
    take: 10,
  });

  const today = londonDateString(now);
  const agency = agencyIdentity(env);

  for (const email of due) {
    // Claim + all compliance re-checks inside one advisory-locked transaction.
    const claim = await withAdvisoryLock(prisma, `daily-send-cap:${today}`, async (tx) => {
      const dailyLimitSetting = await tx.setting.findUnique({ where: { key: "dailyFirstContactLimit" } });
      const cap = typeof dailyLimitSetting?.value === "number" ? dailyLimitSetting.value : env.DAILY_FIRST_CONTACT_LIMIT;

      const dayStart = londonWallClockToDate(today, 0, 0);
      const sentToday = await tx.outreachEmail.count({
        where: { sequence: 1, sentAt: { gte: dayStart }, status: { in: ["SENT", "DELIVERED", "REPLIED"] } },
      });
      if (email.sequence === 1 && sentToday >= cap) return { action: "defer" as const, reason: `daily cap ${cap} reached` };

      const suppressed = await tx.suppression.findFirst({
        where: {
          reversedAt: null,
          OR: [
            { businessId: email.businessId },
            { email: email.contact.email.toLowerCase() },
            { domain: emailDomain(email.contact.email) },
          ],
        },
      });
      if (suppressed) return { action: "block" as const, reason: `suppressed (${suppressed.reason})` };

      const compliance = await tx.complianceRecord.findFirst({
        where: { businessId: email.businessId },
        orderBy: { checkedAt: "desc" },
      });
      if (compliance?.decision !== "CORPORATE_APPROVED") {
        return { action: "block" as const, reason: `compliance decision ${compliance?.decision ?? "missing"}` };
      }

      const contact = await tx.contact.findUniqueOrThrow({ where: { id: email.contactId } });
      if (contact.validationStatus !== "VALID") {
        return { action: "block" as const, reason: `contact validation ${contact.validationStatus}` };
      }

      await tx.outreachEmail.update({ where: { id: email.id }, data: { status: "QUEUED" } });
      return { action: "send" as const, reason: "" };
    });

    if (claim.action === "defer") {
      result.deferred += 1;
      logger.info("send deferred", { emailId: email.id, reason: claim.reason });
      continue;
    }
    if (claim.action === "block") {
      await prisma.outreachEmail.update({
        where: { id: email.id },
        data: { status: "BLOCKED", statusReason: claim.reason },
      });
      await audit(prisma, "system", "outreach.blocked", "OutreachEmail", email.id, { reason: claim.reason });
      result.blocked += 1;
      continue;
    }

    // Reconciliation: if the provider already has this reference, a previous worker sent
    // it and crashed before recording — record, never resend.
    const prior = await provider.findByReference(email.idempotencyKey);
    if (prior) {
      await prisma.outreachEmail.update({
        where: { id: email.id },
        data: { status: "SENT", providerMessageId: prior.providerMessageId, sentAt: new Date(prior.submittedAt) },
      });
      result.reconciled += 1;
      continue;
    }

    try {
      const unsubscribeUrl = `${env.DASHBOARD_BASE_URL}/api/unsubscribe?token=${encodeURIComponent(email.unsubscribeToken ?? "")}`;
      const sendResult = await provider.send({
        to: email.contact.email,
        from: `${agency.senderName} <${agency.senderEmail}>`,
        replyTo: agency.replyToEmail,
        subject: email.subject,
        textBody: email.bodyText,
        htmlBody: email.bodyHtml ?? undefined,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        reference: email.idempotencyKey,
      });
      await prisma.outreachEmail.update({
        where: { id: email.id },
        data: { status: "SENT", providerMessageId: sendResult.providerMessageId, sentAt: new Date() },
      });
      await prisma.business.update({ where: { id: email.businessId }, data: { status: "CONTACTED" } });
      await audit(prisma, "system", "outreach.sent", "OutreachEmail", email.id, {
        providerMessageId: sendResult.providerMessageId,
      });
      result.sent += 1;
    } catch (err) {
      // Return to SCHEDULED for retry; reconciliation guards against double-send.
      await prisma.outreachEmail.update({
        where: { id: email.id },
        data: { status: "SCHEDULED", statusReason: err instanceof Error ? err.message.slice(0, 300) : "send failed" },
      });
      logger.error("send failed; will retry with reconciliation", {
        emailId: email.id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  logger.info("send cycle complete", { ...result });
  return result;
}
