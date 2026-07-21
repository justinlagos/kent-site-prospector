import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-emerald-600" : ""}`}>{value}</div>
    </div>
  );
}

export default async function OverviewPage() {
  const prisma = db();
  const [discovered, qualified, concepts, sent, delivered, replies, positive, meetings, proposals, won, optOuts, bounced] =
    await Promise.all([
      prisma.business.count(),
      prisma.prospectScore.count({ where: { disqualified: false } }),
      prisma.concept.count(),
      prisma.outreachEmail.count({ where: { status: { in: ["SENT", "DELIVERED", "REPLIED", "BOUNCED", "COMPLAINED", "UNSUBSCRIBED"] } } }),
      prisma.outreachEmail.count({ where: { deliveredAt: { not: null } } }),
      prisma.outreachEmail.count({ where: { repliedAt: { not: null } } }),
      prisma.conversion.count({ where: { stage: "POSITIVE_REPLY" } }),
      prisma.conversion.count({ where: { stage: "MEETING" } }),
      prisma.conversion.count({ where: { stage: "PROPOSAL" } }),
      prisma.conversion.count({ where: { stage: "WON" } }),
      prisma.suppression.count({ where: { reason: "UNSUBSCRIBED" } }),
      prisma.outreachEmail.count({ where: { bouncedAt: { not: null } } }),
    ]);

  const pipeline = await prisma.conversion.aggregate({ _sum: { estimatedValue: true }, where: { stage: { in: ["MEETING", "PROPOSAL"] } } });
  const revenue = await prisma.conversion.aggregate({ _sum: { actualValue: true }, where: { stage: "WON" } });
  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

  const latestRun = await prisma.automationRun.findFirst({
    where: { runType: "daily-pipeline" },
    orderBy: { startedAt: "desc" },
    include: { stages: { orderBy: { startedAt: "asc" } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Stat label="Discovered" value={discovered} />
        <Stat label="Qualified" value={qualified} />
        <Stat label="Concepts" value={concepts} />
        <Stat label="Emails sent" value={sent} />
        <Stat label="Replies" value={replies} />
        <Stat label="Positive replies" value={positive} accent />
        <Stat label="Meetings" value={meetings} />
        <Stat label="Proposals" value={proposals} />
        <Stat label="Won" value={won} accent />
        <Stat label="Opt-outs" value={optOuts} />
        <Stat label="Delivered" value={delivered} />
        <Stat label="Bounce rate" value={pct(bounced, sent)} />
        <Stat label="Reply rate" value={pct(replies, sent)} />
        <Stat label="Conversion rate" value={pct(won, sent)} />
        <Stat label="Pipeline est." value={`£${Number(pipeline._sum.estimatedValue ?? 0).toFixed(0)}`} />
        <Stat label="Revenue won" value={`£${Number(revenue._sum.actualValue ?? 0).toFixed(0)}`} accent />
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="font-semibold mb-3">Latest pipeline run {latestRun ? `— ${latestRun.runDate} (${latestRun.status})` : ""}</h2>
        {latestRun ? (
          <ol className="grid md:grid-cols-2 gap-2 text-sm">
            {latestRun.stages.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${s.status === "COMPLETED" ? "bg-emerald-500" : s.status === "FAILED" ? "bg-red-500" : "bg-amber-400"}`} />
                <span className="font-mono">{s.name}</span>
                {s.error && <span className="text-red-600 truncate">{s.error}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-slate-500 text-sm">No runs yet. Start one with: <code>pnpm worker -- --job daily</code></p>
        )}
      </section>
    </div>
  );
}
