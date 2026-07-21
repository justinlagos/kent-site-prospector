import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SuppressionPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const prisma = db();
  const rows = await prisma.suppression.findMany({
    where: params.q
      ? { OR: [{ email: { contains: params.q, mode: "insensitive" } }, { domain: { contains: params.q, mode: "insensitive" } }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { business: { select: { name: true } } },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Suppression list</h1>
      <p className="text-sm text-slate-600">Suppression is permanent. Reversal requires an ADMIN and a written reason; both are audit-logged.</p>
      {params.error && <p className="text-sm text-red-600">Error: {params.error}</p>}
      {params.ok && <p className="text-sm text-emerald-700">Done: {params.ok}</p>}

      <div className="grid md:grid-cols-2 gap-4">
        <form method="GET" className="bg-white border border-slate-200 rounded-xl p-4 flex gap-2 items-end text-sm">
          <label className="grow">Search<input name="q" defaultValue={params.q} className="block w-full border border-slate-300 rounded px-2 py-1"/></label>
          <button className="bg-slate-900 text-white rounded px-4 py-1.5">Search</button>
          <a href={`/api/suppression/export`} className="border border-slate-300 rounded px-4 py-1.5">Export CSV</a>
        </form>
        <form method="POST" action="/api/suppression" className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-2 items-end text-sm">
          <label>Email<input name="email" className="block border border-slate-300 rounded px-2 py-1"/></label>
          <label>or domain<input name="domain" className="block border border-slate-300 rounded px-2 py-1"/></label>
          <label>Reason
            <select name="reason" className="block border border-slate-300 rounded px-2 py-1">
              {["MANUAL","OBJECTION","LEGAL"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label>Note<input name="note" className="block border border-slate-300 rounded px-2 py-1"/></label>
          <button className="bg-red-700 text-white rounded px-4 py-1.5">Add suppression</button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="p-3">Email</th><th className="p-3">Domain</th><th className="p-3">Business</th><th className="p-3">Reason</th><th className="p-3">Source</th><th className="p-3">Date</th><th className="p-3">State</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="p-3 font-mono">{s.email ?? "—"}</td>
                <td className="p-3 font-mono">{s.domain ?? "—"}</td>
                <td className="p-3">{s.business?.name ?? "—"}</td>
                <td className="p-3">{s.reason}</td>
                <td className="p-3">{s.source}</td>
                <td className="p-3">{s.createdAt.toISOString().slice(0, 10)}</td>
                <td className="p-3">{s.reversedAt ? `reversed by ${s.reversedBy}` : "active"}</td>
                <td className="p-3">
                  {!s.reversedAt && session.role === "ADMIN" && (
                    <form method="POST" action="/api/suppression" className="flex gap-1">
                      <input type="hidden" name="action" value="reverse" />
                      <input type="hidden" name="id" value={s.id} />
                      <input name="note" placeholder="reason (required)" required className="border border-slate-300 rounded px-2 py-0.5 text-xs" />
                      <button className="text-xs border border-red-300 text-red-700 rounded px-2 py-0.5">Reverse</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-slate-500">No suppressions.</p>}
      </div>
    </div>
  );
}
