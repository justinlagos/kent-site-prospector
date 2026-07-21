import type { PrismaClient, Prisma, SuppressionReason } from "@ksp/database";
import { audit } from "@ksp/database";
import { ComplianceError, emailDomain } from "@ksp/shared";

/**
 * Suppression manager. Suppression is permanent: rows are never deleted, only marked
 * reversed by an ADMIN with an audit trail. Adding a suppression also cancels every
 * scheduled/queued email for the affected scope in the same transaction.
 */

export interface SuppressInput {
  email?: string;
  domain?: string;
  businessId?: string;
  reason: SuppressionReason;
  source: string;
  note?: string;
  actor?: string;
}

export async function addSuppression(
  db: PrismaClient | Prisma.TransactionClient,
  input: SuppressInput,
): Promise<string> {
  if (!input.email && !input.domain && !input.businessId) {
    throw new ComplianceError("SUPPRESSION_EMPTY", "Suppression requires email, domain or businessId");
  }
  const email = input.email?.toLowerCase();

  const row = await db.suppression.create({
    data: {
      email: email ?? null,
      domain: input.domain?.toLowerCase() ?? null,
      businessId: input.businessId ?? null,
      reason: input.reason,
      source: input.source,
      note: input.note ?? null,
    },
  });

  // Cancel any pending sends within scope, atomically with the suppression.
  const scopeOr: Prisma.OutreachEmailWhereInput[] = [];
  if (input.businessId) scopeOr.push({ businessId: input.businessId });
  if (email) scopeOr.push({ contact: { email } });
  if (input.domain) scopeOr.push({ contact: { email: { endsWith: `@${input.domain.toLowerCase()}` } } });
  if (scopeOr.length > 0) {
    await db.outreachEmail.updateMany({
      where: {
        OR: scopeOr,
        status: { in: ["DRAFT", "QUEUED", "SCHEDULED"] },
      },
      data: { status: "CANCELLED", statusReason: `suppression:${row.id}` },
    });
  }
  if (input.businessId) {
    await db.business.update({ where: { id: input.businessId }, data: { status: "SUPPRESSED" } });
  }

  await audit(db, input.actor ?? "system", "suppression.added", "Suppression", row.id, {
    reason: input.reason,
    source: input.source,
    hasEmail: Boolean(email),
    domain: input.domain ?? null,
    businessId: input.businessId ?? null,
  });
  return row.id;
}

/** Suppress everything associated with a contact's email: the address, and the business. */
export async function suppressContact(
  db: PrismaClient | Prisma.TransactionClient,
  params: {
    email: string;
    businessId?: string;
    reason: SuppressionReason;
    source: string;
    includeDomain?: boolean;
    actor?: string;
  },
): Promise<void> {
  await addSuppression(db, {
    email: params.email,
    businessId: params.businessId,
    reason: params.reason,
    source: params.source,
    actor: params.actor,
  });
  if (params.includeDomain) {
    const domain = emailDomain(params.email);
    if (domain) {
      await addSuppression(db, {
        domain,
        reason: params.reason,
        source: params.source,
        actor: params.actor,
      });
    }
  }
}

export async function isSuppressed(
  db: PrismaClient | Prisma.TransactionClient,
  params: { email?: string; businessId?: string },
): Promise<boolean> {
  const email = params.email?.toLowerCase();
  const domain = email ? emailDomain(email) : undefined;
  const found = await db.suppression.findFirst({
    where: {
      reversedAt: null,
      OR: [
        ...(email ? [{ email }] : []),
        ...(domain ? [{ domain }] : []),
        ...(params.businessId ? [{ businessId: params.businessId }] : []),
      ],
    },
    select: { id: true },
  });
  return Boolean(found);
}

/**
 * Reverse a suppression. ADMIN-only (enforced by callers via role check — and re-asserted
 * here by requiring an actor string that is not "system").
 */
export async function reverseSuppression(
  db: PrismaClient | Prisma.TransactionClient,
  suppressionId: string,
  actor: string,
  reasonNote: string,
): Promise<void> {
  if (!actor || actor === "system") {
    throw new ComplianceError("SUPPRESSION_REVERSAL_ACTOR", "Suppression reversal requires a named ADMIN actor");
  }
  if (!reasonNote.trim()) {
    throw new ComplianceError("SUPPRESSION_REVERSAL_REASON", "Suppression reversal requires a written reason");
  }
  await db.suppression.update({
    where: { id: suppressionId },
    data: { reversedAt: new Date(), reversedBy: actor, note: reasonNote },
  });
  await audit(db, actor, "suppression.reversed", "Suppression", suppressionId, { reasonNote });
}
