import Link from "next/link";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const NAV = [
  ["/", "Overview"],
  ["/queue", "Daily queue"],
  ["/prospects", "Prospects"],
  ["/territories", "Territories"],
  ["/suppression", "Suppression"],
  ["/settings", "Settings"],
] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-100 flex flex-col">
        <div className="p-4 font-bold text-lg border-b border-slate-700">Kent Site Prospector</div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="block px-3 py-2 rounded-lg hover:bg-slate-700 text-sm">
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700 text-xs">
          <div className="truncate">{session.email}</div>
          <div className="text-slate-400">{session.role}</div>
          <form method="POST" action="/api/logout" className="mt-2">
            <button className="text-slate-300 hover:text-white underline">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-x-auto">{children}</main>
    </div>
  );
}
