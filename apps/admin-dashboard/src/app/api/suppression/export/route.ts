import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const rows = await db().suppression.findMany({ orderBy: { createdAt: "desc" } });
  const csv = [
    "email,domain,businessId,reason,source,createdAt,reversedAt,reversedBy",
    ...rows.map((s) =>
      [s.email, s.domain, s.businessId, s.reason, s.source, s.createdAt.toISOString(), s.reversedAt?.toISOString(), s.reversedBy]
        .map((v) => `"${(v ?? "").toString().replaceAll('"', '""')}"`)
        .join(","),
    ),
  ].join("\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=suppression.csv" },
  });
}
