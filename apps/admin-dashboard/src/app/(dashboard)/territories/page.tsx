import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TerritoriesPage() {
  const prisma = db();
  const territories = await prisma.territory.findMany({
    orderBy: [{ localAuthority: "asc" }, { town: "asc" }, { outwardPostcode: "asc" }],
    include: { scans: { include: { category: true } } },
  });
  const queue = await prisma.territoryCategoryScan.findMany({
    where: { status: "PENDING" },
    orderBy: { position: "asc" },
    take: 10,
    include: { territory: true, category: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Territories — Kent coverage</h1>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="font-semibold mb-2">Next in rotation</h2>
        <ol className="text-sm space-y-1 list-decimal list-inside">
          {queue.map((q) => (
            <li key={q.id}>{q.territory.town} ({q.territory.outwardPostcode}) — {q.category.label}</li>
          ))}
        </ol>
      </section>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-3">Local authority</th><th className="p-3">Town</th><th className="p-3">Outward</th>
              <th className="p-3">Status</th><th className="p-3">Last scan</th>
              <th className="p-3">Categories scanned</th><th className="p-3">Discovered</th>
              <th className="p-3">Qualified</th><th className="p-3">Contacted</th><th className="p-3">Converted</th>
            </tr>
          </thead>
          <tbody>
            {territories.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="p-3">{t.localAuthority}</td>
                <td className="p-3 font-medium">{t.town}</td>
                <td className="p-3 font-mono">{t.outwardPostcode}</td>
                <td className="p-3">{t.status}</td>
                <td className="p-3">{t.lastScannedAt?.toISOString().slice(0, 10) ?? "—"}</td>
                <td className="p-3">{t.scans.filter((s) => s.status === "COMPLETED").length}/{t.scans.length}</td>
                <td className="p-3">{t.discoveredCount}</td>
                <td className="p-3">{t.qualifiedCount}</td>
                <td className="p-3">{t.contactedCount}</td>
                <td className="p-3">{t.convertedCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
