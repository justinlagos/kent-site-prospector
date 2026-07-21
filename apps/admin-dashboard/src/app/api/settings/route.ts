import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { audit } from "@ksp/database";

/** Editable settings registry with validation. Only ADMIN can change safety-critical keys. */
const EDITABLE: Record<string, { parse: (v: string) => unknown; adminOnly: boolean }> = {
  dailyFirstContactLimit: { parse: (v) => Math.max(0, Math.min(10, Number(v))), adminOnly: true },
  minProspectScore: { parse: (v) => Math.max(0, Math.min(100, Number(v))), adminOnly: false },
  minOpportunityScore: { parse: (v) => Math.max(0, Math.min(100, Number(v))), adminOnly: false },
  previewExpiryDays: { parse: (v) => Math.max(1, Math.min(365, Number(v))), adminOnly: false },
  followUpsEnabled: { parse: (v) => v === "true", adminOnly: true },
  emailKillSwitch: { parse: (v) => v === "true", adminOnly: false }, // anyone can HALT; only admin can resume
  chainBusinessesEnabled: { parse: (v) => v === "true", adminOnly: true },
  publicBodiesEnabled: { parse: (v) => v === "true", adminOnly: true },
  retentionRejectedDays: { parse: (v) => Math.max(30, Number(v)), adminOnly: true },
  notificationEmail: { parse: (v) => v || null, adminOnly: false },
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  const rawValue = String(form.get("value") ?? "");
  const spec = EDITABLE[key];
  if (!spec) return NextResponse.redirect(new URL("/settings?error=unknown-key", req.url), 303);

  const prisma = db();
  const current = await prisma.setting.findUnique({ where: { key } });
  const next = spec.parse(rawValue);

  const isResumingKillSwitch = key === "emailKillSwitch" && current?.value === true && next === false;
  if ((spec.adminOnly || isResumingKillSwitch) && session.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/settings?error=admin-required", req.url), 303);
  }

  await prisma.setting.upsert({
    where: { key },
    update: { value: next as never, updatedBy: session.email },
    create: { key, value: next as never, updatedBy: session.email },
  });
  await audit(prisma, session.email, "settings.updated", "Setting", key, { from: current?.value, to: next } as never);
  return NextResponse.redirect(new URL("/settings?ok=1", req.url), 303);
}
