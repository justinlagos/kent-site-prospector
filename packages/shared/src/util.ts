import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Normalise a business name for dedup/slug-safety comparisons. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|llp|plc|the|and|&|co|company)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalisePostcode(postcode: string): string {
  return postcode.toUpperCase().replace(/\s+/g, " ").trim();
}

export function outwardCode(postcode: string): string {
  return normalisePostcode(postcode).split(" ")[0] ?? "";
}

/** Stable dedup fingerprint: normalised name + outward postcode. */
export function dedupFingerprint(name: string, postcode: string): string {
  return createHash("sha256")
    .update(`${normaliseName(name)}|${outwardCode(postcode)}`)
    .digest("hex")
    .slice(0, 32);
}

export function randomToken(bytes = 9): string {
  // URL-safe, lowercase, unambiguous
  return randomBytes(bytes).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
}

export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

const GENERIC_PREFIXES = [
  "info",
  "hello",
  "enquiries",
  "enquiry",
  "office",
  "bookings",
  "booking",
  "reception",
  "sales",
  "contact",
  "admin",
  "mail",
  "team",
];

export function classifyEmailType(email: string): "GENERIC" | "ROLE" | "PERSONAL" {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (GENERIC_PREFIXES.includes(local)) return "GENERIC";
  if (/^[a-z]+\.[a-z]+$/.test(local) || /^[a-z]\.[a-z]+$/.test(local)) return "PERSONAL";
  if (/^(accounts|support|marketing|hr|jobs|careers|press)$/.test(local)) return "ROLE";
  // Single first names are treated as personal out of caution.
  if (/^[a-z]{2,12}$/.test(local) && !GENERIC_PREFIXES.includes(local)) return "PERSONAL";
  return "ROLE";
}

// ---------------------------------------------------------------------------
// Signed unsubscribe tokens (HMAC, no DB dependency to honour)
// ---------------------------------------------------------------------------

export function signUnsubscribeToken(secret: string, email: string, businessId: string): string {
  const payload = Buffer.from(JSON.stringify({ e: email, b: businessId })).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(
  secret: string,
  token: string,
): { email: string; businessId: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e?: string; b?: string };
    if (typeof data.e !== "string" || typeof data.b !== "string") return null;
    return { email: data.e, businessId: data.b };
  } catch {
    return null;
  }
}

/** Deterministic idempotency key for an outreach email. */
export function outreachIdempotencyKey(businessId: string, contactId: string, sequence: number): string {
  return `outreach:${businessId}:${contactId}:${sequence}`;
}
