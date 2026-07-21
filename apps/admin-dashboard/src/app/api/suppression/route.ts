import { NextRequest, NextResponse } from "next/server";
import { addSuppression, reverseSuppression } from "@ksp/compliance";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import type { SuppressionReason } from "@ksp/database";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const form = await req.formData();
  const action = String(form.get("action") ?? "add");

  if (action === "reverse") {
    if (session.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/suppression?error=admin-required", req.url), 303);
    }
    const id = String(form.get("id") ?? "");
    const note = String(form.get("note") ?? "");
    try {
      await reverseSuppression(db(), id, session.email, note);
    } catch {
      return NextResponse.redirect(new URL("/suppression?error=reversal-failed", req.url), 303);
    }
    return NextResponse.redirect(new URL("/suppression?ok=reversed", req.url), 303);
  }

  const email = String(form.get("email") ?? "").trim() || undefined;
  const domain = String(form.get("domain") ?? "").trim() || undefined;
  const reason = (String(form.get("reason") ?? "MANUAL") as SuppressionReason) ?? "MANUAL";
  if (!email && !domain) {
    return NextResponse.redirect(new URL("/suppression?error=empty", req.url), 303);
  }
  await addSuppression(db(), {
    email,
    domain,
    reason,
    source: "dashboard",
    actor: session.email,
    note: String(form.get("note") ?? "") || undefined,
  });
  return NextResponse.redirect(new URL("/suppression?ok=added", req.url), 303);
}
