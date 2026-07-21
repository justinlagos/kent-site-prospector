/**
 * Idempotent seed: Kent territories, categories, rotation queue, settings,
 * policy document templates, initial admin user.
 * Run: pnpm --filter @ksp/database run seed
 */
import { scryptSync, randomBytes } from "node:crypto";
import { getPrisma, disconnectPrisma } from "./client.js";
import {
  KENT_TERRITORIES,
  BUSINESS_CATEGORIES,
  ROTATION_HEAD,
  DEFAULT_SETTINGS,
} from "./seed-data.js";
import { POLICY_TEMPLATES } from "./policy-templates.js";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64).toString("hex");
  // timing-safe compare
  if (candidate.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export async function runSeed(databaseUrl?: string): Promise<void> {
  const prisma = getPrisma(databaseUrl);

  // Territories
  for (const t of KENT_TERRITORIES) {
    await prisma.territory.upsert({
      where: { town_outwardPostcode: { town: t.town, outwardPostcode: t.outwardPostcode } },
      update: { localAuthority: t.localAuthority, priority: t.priority },
      create: {
        localAuthority: t.localAuthority,
        town: t.town,
        district: t.district ?? null,
        outwardPostcode: t.outwardPostcode,
        priority: t.priority,
      },
    });
  }

  // Categories
  for (const c of BUSINESS_CATEGORIES) {
    await prisma.category.upsert({
      where: { key: c.key },
      update: { label: c.label, providerTypes: c.providerTypes, strategyKey: c.strategyKey, priority: c.priority },
      create: {
        key: c.key,
        label: c.label,
        providerTypes: c.providerTypes,
        strategyKey: c.strategyKey,
        priority: c.priority,
      },
    });
  }

  // Rotation queue: head pairs first, then interleaved coverage of all pairs.
  const territories = await prisma.territory.findMany({ orderBy: [{ priority: "asc" }, { town: "asc" }] });
  const categories = await prisma.category.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ priority: "asc" }, { key: "asc" }],
  });

  let position = 0;
  const queued = new Set<string>();

  const enqueue = async (territoryId: string, categoryId: string) => {
    const pairKey = `${territoryId}:${categoryId}`;
    if (queued.has(pairKey)) return;
    queued.add(pairKey);
    position += 1;
    await prisma.territoryCategoryScan.upsert({
      where: { territoryId_categoryId: { territoryId, categoryId } },
      update: {},
      create: { territoryId, categoryId, position },
    });
  };

  for (const head of ROTATION_HEAD) {
    const territory = territories.find(
      (t) => t.town === head.townPostcode[0] && t.outwardPostcode === head.townPostcode[1],
    );
    const category = categories.find((c) => c.key === head.categoryKey);
    if (territory && category) await enqueue(territory.id, category.id);
  }

  // Interleave remaining pairs with coprime strides so towns and industries rotate.
  const tCount = territories.length;
  const cCount = categories.length;
  for (let i = 0; i < tCount * cCount; i++) {
    const territory = territories[(i * 7) % tCount];
    const category = categories[(i * 11) % cCount];
    if (territory && category) await enqueue(territory.id, category.id);
  }

  // Settings
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as never, updatedBy: "seed" },
    });
  }

  // Policy documents (v1.0 templates)
  for (const p of POLICY_TEMPLATES) {
    await prisma.policyDocument.upsert({
      where: { key_version: { key: p.key, version: p.version } },
      update: {},
      create: { ...p, createdBy: "seed" },
    });
  }

  // Initial admin (change password immediately; documented in setup.md)
  const initialEmail = process.env.INITIAL_ADMIN_EMAIL ?? "admin@example.com";
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-immediately";
  await prisma.adminUser.upsert({
    where: { email: initialEmail },
    update: {},
    create: {
      email: initialEmail,
      name: "Initial Admin",
      passwordHash: hashPassword(initialPassword),
      role: "ADMIN",
    },
  });

  console.log(
    `Seed complete: ${KENT_TERRITORIES.length} territories, ${BUSINESS_CATEGORIES.length} categories, ${position} rotation pairs.`,
  );
}

const isMain = process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (isMain) {
  runSeed()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => disconnectPrisma());
}
