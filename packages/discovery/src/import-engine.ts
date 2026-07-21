import type { PrismaClient } from "@ksp/database";
import { audit } from "@ksp/database";
import {
  DiscoveredBusiness,
  classifyEmailType,
  dedupFingerprint,
  emailDomain,
  normalisePostcode,
  type Logger,
} from "@ksp/shared";

export interface ImportResult {
  imported: string[]; // business ids
  duplicates: number;
  suppressedSkipped: number;
  closedSkipped: number;
}

/**
 * Import discovered businesses with strict deduplication and suppression pre-screening.
 *
 * - A business already known (same provider place ID, or same normalised name+outward
 *   postcode fingerprint) is never re-created.
 * - A business/domain/email on the active suppression list is never imported.
 * - Permanently closed businesses are skipped.
 * - Emails are stored exactly as published by the source; never guessed. Personal-looking
 *   addresses are stored flagged PERSONAL and are never auto-used downstream.
 */
export async function importDiscoveredBusinesses(
  prisma: PrismaClient,
  logger: Logger,
  input: {
    discovered: DiscoveredBusiness[];
    source: string;
    territoryId: string;
    categoryId: string;
  },
): Promise<ImportResult> {
  const result: ImportResult = { imported: [], duplicates: 0, suppressedSkipped: 0, closedSkipped: 0 };

  for (const biz of input.discovered) {
    if (biz.businessStatus === "CLOSED_PERMANENTLY") {
      result.closedSkipped += 1;
      continue;
    }

    const fingerprint = dedupFingerprint(biz.name, biz.postcode);

    const existing = await prisma.business.findFirst({
      where: {
        OR: [
          { dedupFingerprint: fingerprint },
          ...(biz.providerPlaceId
            ? [{ discoverySource: input.source, providerPlaceId: biz.providerPlaceId }]
            : []),
        ],
      },
      select: { id: true },
    });
    if (existing) {
      result.duplicates += 1;
      continue;
    }

    // Suppression pre-screen: email, domain (of email and website), fuzzy none for name.
    const domains = new Set<string>();
    if (biz.email) domains.add(emailDomain(biz.email));
    if (biz.website) {
      try {
        domains.add(new URL(biz.website).hostname.replace(/^www\./, ""));
      } catch {
        /* invalid URL — auditor will handle */
      }
    }
    const suppressed = await prisma.suppression.findFirst({
      where: {
        reversedAt: null,
        OR: [
          ...(biz.email ? [{ email: biz.email.toLowerCase() }] : []),
          ...[...domains].map((d) => ({ domain: d })),
        ],
      },
      select: { id: true },
    });
    if (suppressed) {
      result.suppressedSkipped += 1;
      logger.info("import skipped: suppressed", { name: biz.name });
      continue;
    }

    const created = await prisma.business.create({
      data: {
        name: biz.name,
        tradingName: biz.tradingName ?? null,
        categoryId: input.categoryId,
        territoryId: input.territoryId,
        address: biz.address,
        town: biz.town,
        postcode: normalisePostcode(biz.postcode),
        phone: biz.phone ?? null,
        website: biz.website ?? null,
        primaryEmail: biz.email?.toLowerCase() ?? null,
        socialProfiles: biz.socialProfiles ?? undefined,
        googleProfileUrl: biz.googleProfileUrl ?? null,
        providerPlaceId: biz.providerPlaceId,
        reviewCount: biz.reviewCount ?? null,
        reviewRating: biz.reviewRating ?? null,
        openingHours: biz.openingHours ?? undefined,
        services: biz.services ?? undefined,
        discoverySource: input.source,
        sourceUrl: biz.sourceUrl ?? null,
        confidence: biz.confidence,
        dedupFingerprint: fingerprint,
      },
    });

    if (biz.email) {
      await prisma.contact.create({
        data: {
          businessId: created.id,
          email: biz.email.toLowerCase(),
          emailType: classifyEmailType(biz.email),
          source: input.source,
        },
      });
    }

    await audit(prisma, "system", "business.imported", "Business", created.id, {
      source: input.source,
    });
    result.imported.push(created.id);
  }

  logger.info("import complete", { ...result, importedCount: result.imported.length });
  return result;
}
