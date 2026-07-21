import Link from "next/link";
import { db } from "@/lib/db";
import { londonDateString } from "@ksp/shared";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const prisma = db();
  const today = londonDateString(new Date());
  const run = await prisma.automationRun.findUnique({
    where: { runDate_runType: { runDate: today, runType: "daily-pipeline" } },
    include: { stages: true },
  });
  const selectedIds = (run?.selectedBusinesses as string[] | null) ?? [];
  const selected = await prisma.business.findMany({
    where: { id: { in: selectedIds } },
    include: {
      territory: true,
      category: true,
      scores: { orderBy: { calculatedAt: "desc" }, take: 1 },
      complianceRecords: { orderBy: { checkedAt: "desc" }, take: 1 },
      audits: { orderBy: { auditDate: "desc" }, take: 1 },
      concepts: { orderBy: { createdAt: "desc" }, take: 1 },
      outreachEmails: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const territoryDetail = (run?.stages.find((s) => s.name === "select-territory")?.detail ?? {}) as Record<string, string>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Daily queue — {today}</h1>
      <p className="text-sm text-slate-600">
        Territory: <strong>{territoryDetail.town ?? "—"} ({territoryDetail.outwardPostcode ?? "—"})</strong> · Category:{" "}
        <strong>{territoryDetail.categoryLabel ?? "—"}</strong> · Run status: <strong>{run?.status ?? "not started"}</strong>
      </p>
      {selected.length === 0 && <p className="text-slate-500">No businesses selected yet today.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {selected.map((b) => (
          <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <Link href={`/prospects/${b.id}`} className="font-semibold text-lg hover:underline">{b.name}</Link>
                <div className="text-sm text-slate-500">{b.town} · {b.postcode} · {b.category.label}</div>
              </div>
              <span className="text-2xl font-bold">{b.scores[0]?.totalScore ?? "—"}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500">Compliance</dt><dd>{b.complianceRecords[0]?.decision ?? "—"}</dd>
              <dt className="text-slate-500">Audit opportunity</dt><dd>{b.audits[0]?.opportunityScore ?? "—"}/100</dd>
              <dt className="text-slate-500">Concept</dt><dd>{b.concepts[0]?.status ?? "—"}</dd>
              <dt className="text-slate-500">Preview</dt>
              <dd>{b.concepts[0]?.previewUrl ? <a className="text-blue-600 hover:underline" href={b.concepts[0].previewUrl} rel="noreferrer nofollow" target="_blank">open ↗</a> : "—"}</dd>
              <dt className="text-slate-500">Email</dt><dd>{b.outreachEmails[0]?.status ?? "—"}</dd>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
