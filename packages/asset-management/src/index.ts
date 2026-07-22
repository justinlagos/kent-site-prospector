import type { PrismaClient, Prisma, AssetRightsStatus } from "@ksp/database";
import { audit } from "@ksp/database";
import { ComplianceError } from "@ksp/shared";

/**
 * Asset-rights registry. Every visual/media asset that could appear in a preview must be
 * registered with a rights status. Only the five publishable statuses may be rendered.
 * Anything sourced from social media, Google Images or third-party directories defaults
 * to REFERENCE_ONLY and is never published automatically.
 */

export const PUBLISHABLE_STATUSES: AssetRightsStatus[] = [
  "BUSINESS_OWNED_AND_PERMISSION_CONFIRMED",
  "LICENSED_STOCK",
  "PROVIDED_BY_OPERATOR",
  "GENERATED",
  "PLACEHOLDER",
];

const THIRD_PARTY_SOURCES = /google[- ]?images|facebook|instagram|twitter|x\.com|linkedin|yelp|tripadvisor|directory/i;

export interface RegisterAssetInput {
  businessId: string;
  source: string;
  sourceUrl?: string;
  licenceType?: string;
  requestedStatus: AssetRightsStatus;
  businessOwned?: boolean;
  intendedUse: string;
  localPath?: string;
  attributionRequirement?: string;
  expiryDate?: Date;
  actor?: string;
}

/**
 * Register an asset. Third-party-sourced assets are forcibly downgraded to REFERENCE_ONLY
 * regardless of the requested status, unless documented business permission is asserted.
 */
export async function registerAsset(
  db: PrismaClient | Prisma.TransactionClient,
  input: RegisterAssetInput,
): Promise<{ id: string; rightsStatus: AssetRightsStatus }> {
  let status = input.requestedStatus;
  if (
    THIRD_PARTY_SOURCES.test(input.source) &&
    status !== "PROHIBITED" &&
    !(status === "BUSINESS_OWNED_AND_PERMISSION_CONFIRMED" && input.businessOwned)
  ) {
    status = "REFERENCE_ONLY";
  }
  const row = await db.asset.create({
    data: {
      businessId: input.businessId,
      source: input.source,
      sourceUrl: input.sourceUrl ?? null,
      licenceType: input.licenceType ?? null,
      rightsStatus: status,
      businessOwned: input.businessOwned ?? false,
      intendedUse: input.intendedUse,
      localPath: input.localPath ?? null,
      attributionRequirement: input.attributionRequirement ?? null,
      expiryDate: input.expiryDate ?? null,
    },
  });
  await audit(db, input.actor ?? "system", "asset.registered", "Asset", row.id, {
    requested: input.requestedStatus,
    granted: status,
  });
  return { id: row.id, rightsStatus: status };
}

export function isPublishable(status: AssetRightsStatus, expiryDate?: Date | null): boolean {
  if (!PUBLISHABLE_STATUSES.includes(status)) return false;
  if (expiryDate && expiryDate.getTime() < Date.now()) return false;
  return true;
}

/**
 * Assert every externally referenced asset in a rendered page is publishable.
 * Inline data: URIs (generated SVG placeholders) are intrinsically GENERATED/PLACEHOLDER
 * and allowed. Any http(s) asset must be registered and publishable.
 */
export async function assertRenderedAssetsPublishable(
  db: PrismaClient | Prisma.TransactionClient,
  businessId: string,
  html: string,
): Promise<void> {
  const externalRefs = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+\.(?:png|jpe?g|webp|gif|svg|avif|mp4|woff2?))"/gi)].map(
    (m) => m[1]!,
  );
  if (externalRefs.length === 0) return;

  const assets = await db.asset.findMany({ where: { businessId } });
  for (const ref of externalRefs) {
    const asset = assets.find((a) => a.sourceUrl === ref || a.localPath === ref);
    if (!asset) {
      throw new ComplianceError("ASSET_UNREGISTERED", `Rendered asset is not registered: ${ref}`, { ref });
    }
    if (!isPublishable(asset.rightsStatus, asset.expiryDate)) {
      throw new ComplianceError(
        "ASSET_NOT_PUBLISHABLE",
        `Rendered asset ${ref} has non-publishable rights status ${asset.rightsStatus}`,
        { ref, status: asset.rightsStatus },
      );
    }
  }
}
export * from "./imagegen.js";
