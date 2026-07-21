import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadEnv } from "@ksp/shared";
import { getPrisma, verifyPassword } from "@ksp/database";

/**
 * Cookie sessions: HMAC-signed payload, HttpOnly, SameSite=Strict (CSRF mitigation for
 * all state-changing same-site form posts), 12-hour expiry. scrypt-hashed passwords.
 */

export interface Session {
  email: string;
  role: "ADMIN" | "OPERATOR";
  exp: number;
}

const COOKIE = "ksp_session";

function secret(): string {
  return loadEnv().SESSION_SECRET;
}

export function signSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE)?.value);
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/?error=admin-required");
  return session;
}

// Simple in-memory login rate limiter (per process).
const attempts = new Map<string, { count: number; resetAt: number }>();

export function loginRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

export async function attemptLogin(email: string, password: string): Promise<Session | null> {
  const prisma = getPrisma(loadEnv().DATABASE_URL);
  const user = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { email: user.email, role: user.role, exp: Date.now() + 12 * 3600_000 };
}

export function sessionCookieOptions() {
  return {
    name: COOKIE,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: loadEnv().APP_ENV === "production",
    path: "/",
    maxAge: 12 * 3600,
  };
}
