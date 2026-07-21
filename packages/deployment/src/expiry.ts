import type { PrismaClient } from "@ksp/database";
import { audit } from "@ksp/database";
import { DeployAdapter, type Logger } from "@ksp/shared";

const EXPIRED_PAGE = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow, noarchive"/>
<title>Concept expired</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7fafc;color:#2d3748}main{text-align:center;padding:2rem;max-width:28rem}</style>
</head>
<body><main><h1>This design concept has expired</h1><p>This page hosted a time-limited, independent website design demonstration. It was never an official business website.</p></main></body>
</html>
`;

/**
 * Unpublish previews past their expiry: replace the deployment with a neutral expired
 * page (keeping the URL harmless) and mark the concept EXPIRED. Idempotent.
 */
export async function unpublishExpiredConcepts(
  prisma: PrismaClient,
  deployer: DeployAdapter,
  logger: Logger,
): Promise<number> {
  const due = await prisma.concept.findMany({
    where: { status: "DEPLOYED", expiresAt: { lt: new Date() }, siteId: { not: null } },
  });

  let count = 0;
  for (const concept of due) {
    try {
      await deployer.replace(concept.siteId!, {
        "index.html": EXPIRED_PAGE,
        "robots.txt": "User-agent: *\nDisallow: /\n",
        _headers: "/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n",
      });
      await prisma.concept.update({
        where: { id: concept.id },
        data: { status: "EXPIRED" },
      });
      await audit(prisma, "system", "concept.expired", "Concept", concept.id);
      count += 1;
    } catch (err) {
      logger.error("failed to unpublish expired concept", {
        conceptId: concept.id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  if (count > 0) logger.info("expired concepts unpublished", { count });
  return count;
}

/** Manual expiry extension (dashboard action). */
export async function extendConceptExpiry(
  prisma: PrismaClient,
  conceptId: string,
  additionalDays: number,
  actor: string,
): Promise<Date> {
  const concept = await prisma.concept.findUniqueOrThrow({ where: { id: conceptId } });
  const from = concept.expiresAt && concept.expiresAt > new Date() ? concept.expiresAt : new Date();
  const next = new Date(from.getTime() + additionalDays * 86_400_000);
  await prisma.concept.update({ where: { id: conceptId }, data: { expiresAt: next } });
  await audit(prisma, actor, "concept.expiry-extended", "Concept", conceptId, {
    additionalDays,
    newExpiry: next.toISOString(),
  });
  return next;
}
