import Link from "next/link";
import { db } from "@/lib/db";
import type { Prisma } from "@ksp/database";

export const dynamic = "force-dynamic";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const prisma = db();
  const where: Prisma.BusinessWhereInput = {};
  if (params.town) where.town = { contains: params.town, mode: "insensitive" };
  if (params.postcode) where.postcode = { startsWith: params.postcode.toUpperCase() };
  if (params.category) where.category = { key: params.category };
  if (params.legalForm) where.legalForm = params.legalForm as never;
  if (params.status) where.status = params.status as never;

  const categories = await prisma.category.findMany({ orderBy: { label: "asc" } });
  const businesses = await prisma.business.findMany({
    where,
    include: {
      category: true,
      scores: { orderBy: { calculatedAt: "desc" }, take: 1 },
      outreachEmails: { orderBy: { createdAt: "desc" }, take: 1 },
      conversions: { orderBy: { updatedAt: "desc" }, take: 1 },
    },
    orderBy: { discoveredAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Prospects</h1>
      <form method="GET" className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 text-sm items-end">
        <label>Town<input name="town" defaultValue={params.town} className="block border border-slate-300 rounded px-2 py-1"/></label>
        <label>Postcode<input name="postcode" defaultValue={params.postcode} className="block border border-slate-300 rounded px-2 py-1 w-24"/></label>
        <label>Category
          <select name="category" defaultValue={params.category} className="block border border-slate-300 rounded px-2 py-1">
            <option value="">All</option>
            {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label>Legal form
          <select name="legalForm" defaultValue={params.legalForm} className="block border border-slate-300 rounded px-2 py-1">
            <option value="">All</option>
            {["LTD","LLP","PLC","CHARITY","SOLE_TRADER","PARTNERSHIP","UNKNOWN"].map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label>Status
          <select name="status" defaultValue={params.status} className="block border border-slate-300 rounded px-2 py-1">
            <option value="">All</option>
            {["DISCOVERED","VERIFIED","AUDITED","SCORED","SELECTED","CONTACTED","REPLIED","CONVERTED","DISQUALIFIED","SUPPRESSED"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <button className="bg-slate-900 text-white rounded px-4 py-1.5">Filter</button>
      </form>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-3">Business</th><th className="p-3">Town</th><th className="p-3">Category</th>
              <th className="p-3">Legal form</th><th className="p-3">Score</th><th className="p-3">Status</th>
              <th className="p-3">Email</th><th className="p-3">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((b) => (
              <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3"><Link href={`/prospects/${b.id}`} className="font-medium hover:underline">{b.name}</Link></td>
                <td className="p-3">{b.town}</td>
                <td className="p-3">{b.category.label}</td>
                <td className="p-3">{b.legalForm}</td>
                <td className="p-3">{b.scores[0]?.disqualified ? "DQ" : b.scores[0]?.totalScore ?? "—"}</td>
                <td className="p-3">{b.status}</td>
                <td className="p-3">{b.outreachEmails[0]?.status ?? "—"}</td>
                <td className="p-3">{b.conversions[0]?.stage ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {businesses.length === 0 && <p className="p-4 text-slate-500">No prospects match.</p>}
      </div>
    </div>
  );
}
