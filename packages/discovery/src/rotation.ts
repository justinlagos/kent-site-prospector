import type { PrismaClient } from "@ksp/database";

export interface RotationSelection {
  scanId: string;
  territoryId: string;
  categoryId: string;
  town: string;
  outwardPostcode: string;
  localAuthority: string;
  categoryKey: string;
  categoryLabel: string;
  providerTypes: string[];
  strategyKey: string;
}

/**
 * Select the next (territory, category) pair from the persistent rotation queue.
 * The queue continues week to week; nothing restarts. Paused/excluded categories and
 * paused territories are skipped without losing their place (status SKIPPED).
 */
export async function selectNextRotation(prisma: PrismaClient): Promise<RotationSelection | null> {
  // Resume an in-progress scan first (crash recovery).
  const inProgress = await prisma.territoryCategoryScan.findFirst({
    where: { status: "IN_PROGRESS" },
    orderBy: { position: "asc" },
    include: { territory: true, category: true },
  });

  const candidate =
    inProgress ??
    (await prisma.territoryCategoryScan.findFirst({
      where: { status: "PENDING" },
      orderBy: { position: "asc" },
      include: { territory: true, category: true },
    }));

  if (!candidate) return null;

  if (candidate.category.status !== "ACTIVE" || candidate.territory.status === "PAUSED") {
    await prisma.territoryCategoryScan.update({
      where: { id: candidate.id },
      data: { status: "SKIPPED", scannedAt: new Date() },
    });
    return selectNextRotation(prisma);
  }

  await prisma.territoryCategoryScan.update({
    where: { id: candidate.id },
    data: { status: "IN_PROGRESS" },
  });

  return {
    scanId: candidate.id,
    territoryId: candidate.territoryId,
    categoryId: candidate.categoryId,
    town: candidate.territory.town,
    outwardPostcode: candidate.territory.outwardPostcode,
    localAuthority: candidate.territory.localAuthority,
    categoryKey: candidate.category.key,
    categoryLabel: candidate.category.label,
    providerTypes: candidate.category.providerTypes,
    strategyKey: candidate.category.strategyKey,
  };
}

export async function completeRotation(
  prisma: PrismaClient,
  scanId: string,
  counts: { discovered: number; qualified: number; contacted: number },
): Promise<void> {
  const scan = await prisma.territoryCategoryScan.update({
    where: { id: scanId },
    data: {
      status: "COMPLETED",
      scannedAt: new Date(),
      discoveredCount: counts.discovered,
      qualifiedCount: counts.qualified,
      contactedCount: counts.contacted,
    },
  });
  await prisma.territory.update({
    where: { id: scan.territoryId },
    data: {
      lastScannedAt: new Date(),
      status: "ACTIVE",
      discoveredCount: { increment: counts.discovered },
      qualifiedCount: { increment: counts.qualified },
      contactedCount: { increment: counts.contacted },
    },
  });
}
