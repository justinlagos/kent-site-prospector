import { PrismaClient, Prisma } from "@prisma/client";

let _client: PrismaClient | null = null;

export function getPrisma(datasourceUrl?: string): PrismaClient {
  if (_client) return _client;
  _client = new PrismaClient(
    datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : undefined,
  );
  return _client;
}

export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = null;
  }
}

/** Stable 32-bit hash for advisory-lock keys. */
export function lockKey(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

/**
 * Run `fn` inside a transaction holding a Postgres transaction-scoped advisory lock.
 * Used for: run-level mutual exclusion and the daily send-cap check.
 */
export async function withAdvisoryLock<T>(
  prisma: PrismaClient,
  name: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts?: { timeoutMs?: number },
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey(name)})`);
      return fn(tx);
    },
    // Long-running holders (the daily pipeline wraps browser work) pass a large timeout.
    { timeout: opts?.timeoutMs ?? 120_000, maxWait: 60_000 },
  );
}

/** Append-only audit log write. */
export async function audit(
  db: PrismaClient | Prisma.TransactionClient,
  actor: string,
  action: string,
  entityType: string,
  entityId?: string,
  detail?: Prisma.InputJsonValue,
): Promise<void> {
  await db.auditLog.create({
    data: { actor, action, entityType, entityId: entityId ?? null, detail: detail ?? undefined },
  });
}

export * from "@prisma/client";
