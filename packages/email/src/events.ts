import type { PrismaClient } from "@ksp/database";
import { audit } from "@ksp/database";
import { suppressContact } from "@ksp/compliance";
import { verifyUnsubscribeToken, type Logger } from "@ksp/shared";

/**
 * Inbound event handling: provider webhooks (delivery, bounce, complaint), replies, and
 * one-click unsubscribes. Every stop-signal suppresses immediately and cancels anything
 * still scheduled — in the same transaction.
 */

export type ProviderEvent =
  | { type: "delivery"; providerMessageId: string; at: Date }
  | { type: "bounce"; providerMessageId: string; at: Date; hard: boolean; email: string }
  | { type: "complaint"; providerMessageId: string; at: Date; email: string }
  | { type: "reply"; providerMessageId?: string; fromEmail: string; at: Date; textSnippet?: string };

export async function processProviderEvent(
  prisma: PrismaClient,
  logger: Logger,
  event: ProviderEvent,
): Promise<void> {
  switch (event.type) {
    case "delivery": {
      await prisma.outreachEmail.updateMany({
        where: { providerMessageId: event.providerMessageId },
        data: { status: "DELIVERED", deliveredAt: event.at },
      });
      return;
    }
    case "bounce": {
      const email = await prisma.outreachEmail.findFirst({
        where: { providerMessageId: event.providerMessageId },
      });
      await prisma.$transaction(async (tx) => {
        await tx.outreachEmail.updateMany({
          where: { providerMessageId: event.providerMessageId },
          data: { status: "BOUNCED", bouncedAt: event.at },
        });
        if (event.hard) {
          await suppressContact(tx, {
            email: event.email,
            businessId: email?.businessId,
            reason: "HARD_BOUNCE",
            source: "provider-webhook",
          });
          await tx.contact.updateMany({
            where: { email: event.email.toLowerCase() },
            data: { validationStatus: "INVALID", validationDetail: "hard bounce" },
          });
        }
      });
      logger.info("bounce processed", { hard: event.hard });
      return;
    }
    case "complaint": {
      const email = await prisma.outreachEmail.findFirst({
        where: { providerMessageId: event.providerMessageId },
      });
      await prisma.$transaction(async (tx) => {
        await tx.outreachEmail.updateMany({
          where: { providerMessageId: event.providerMessageId },
          data: { status: "COMPLAINED", complaintAt: event.at },
        });
        await suppressContact(tx, {
          email: event.email,
          businessId: email?.businessId,
          reason: "COMPLAINT",
          source: "provider-webhook",
          includeDomain: true,
        });
      });
      logger.warn("spam complaint processed; contact and domain suppressed");
      return;
    }
    case "reply": {
      const from = event.fromEmail.toLowerCase();
      const outreach = event.providerMessageId
        ? await prisma.outreachEmail.findFirst({ where: { providerMessageId: event.providerMessageId } })
        : await prisma.outreachEmail.findFirst({
            where: { contact: { email: from }, status: { in: ["SENT", "DELIVERED"] } },
            orderBy: { sentAt: "desc" },
          });
      await prisma.$transaction(async (tx) => {
        if (outreach) {
          await tx.outreachEmail.update({
            where: { id: outreach.id },
            data: { status: "REPLIED", repliedAt: event.at },
          });
          await tx.business.update({ where: { id: outreach.businessId }, data: { status: "REPLIED" } });
          await tx.conversion.create({
            data: { businessId: outreach.businessId, stage: "REPLIED", notes: event.textSnippet?.slice(0, 500) ?? null },
          });
          // A reply stops all further automated messages to this contact and company.
          // (Not a permanent suppression — the human operator decides next steps — but
          // every scheduled automated send is cancelled.)
          await tx.outreachEmail.updateMany({
            where: {
              businessId: outreach.businessId,
              status: { in: ["DRAFT", "QUEUED", "SCHEDULED"] },
            },
            data: { status: "CANCELLED", statusReason: "reply received" },
          });
        }
        await audit(tx, "system", "outreach.reply", "OutreachEmail", outreach?.id, { from });
      });
      logger.info("reply processed; automated sends cancelled for business");
      return;
    }
  }
}

export interface UnsubscribeResult {
  ok: boolean;
  email?: string;
}

/** Honour a one-click unsubscribe. Token is HMAC-signed; no login, no friction. */
export async function handleUnsubscribe(
  prisma: PrismaClient,
  logger: Logger,
  hmacSecret: string,
  token: string,
): Promise<UnsubscribeResult> {
  const payload = verifyUnsubscribeToken(hmacSecret, token);
  if (!payload) return { ok: false };

  await prisma.$transaction(async (tx) => {
    await suppressContact(tx, {
      email: payload.email,
      businessId: payload.businessId,
      reason: "UNSUBSCRIBED",
      source: "one-click-unsubscribe",
    });
    await tx.outreachEmail.updateMany({
      where: { contact: { email: payload.email.toLowerCase() }, businessId: payload.businessId },
      data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
    });
  });
  logger.info("unsubscribe honoured", { businessId: payload.businessId });
  return { ok: true, email: payload.email };
}
