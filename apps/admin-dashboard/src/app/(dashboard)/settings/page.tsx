import { db, env } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { sendingAllowed } from "@ksp/shared";

export const dynamic = "force-dynamic";

const FIELDS: Array<{ key: string; label: string; type: "number" | "boolean" | "text"; help: string }> = [
  { key: "dailyFirstContactLimit", label: "Daily first-contact limit", type: "number", help: "Hard cap on new-business emails per weekday (ADMIN)" },
  { key: "minProspectScore", label: "Minimum prospect score", type: "number", help: "0–100 threshold for selection" },
  { key: "minOpportunityScore", label: "Minimum website-opportunity score", type: "number", help: "Below this the site is considered too good to pitch" },
  { key: "previewExpiryDays", label: "Preview expiry (days)", type: "number", help: "Concepts auto-unpublish after this many days" },
  { key: "followUpsEnabled", label: "Follow-ups enabled", type: "boolean", help: "OFF by default. One polite follow-up max when enabled (ADMIN)" },
  { key: "emailKillSwitch", label: "EMAIL KILL SWITCH", type: "boolean", help: "true halts ALL sending immediately. Anyone can halt; only ADMIN can resume" },
  { key: "chainBusinessesEnabled", label: "Allow chain businesses", type: "boolean", help: "ADMIN" },
  { key: "publicBodiesEnabled", label: "Allow public bodies", type: "boolean", help: "ADMIN" },
  { key: "retentionRejectedDays", label: "Retention for rejected prospects (days)", type: "number", help: "Personal data anonymised after this period (ADMIN)" },
  { key: "notificationEmail", label: "Notification email", type: "text", help: "Internal reports destination" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  await requireSession();
  const prisma = db();
  const settings = Object.fromEntries((await prisma.setting.findMany()).map((s) => [s.key, s.value]));
  const e = env();
  const gate = sendingAllowed(e);

  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-bold">Settings</h1>
      {params.error && <p className="text-sm text-red-600">Error: {params.error}</p>}
      {params.ok && <p className="text-sm text-emerald-700">Saved.</p>}

      <section className={`border rounded-xl p-4 ${gate.allowed ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <h2 className="font-semibold">Real sending status</h2>
        <p className="text-sm">{gate.allowed ? "ENABLED — real emails will be transmitted in the send window." : `Disabled: ${gate.reason}`}</p>
        <p className="text-xs text-slate-600 mt-1">
          Adapters: directory={e.DIRECTORY_ADAPTER} registry={e.REGISTRY_ADAPTER} llm={e.LLM_ADAPTER} deploy={e.DEPLOY_ADAPTER} email={e.EMAIL_PROVIDER_ADAPTER}.
          Env-level credentials and agency identity are configured via environment variables, never in this UI.
        </p>
      </section>

      <div className="space-y-3">
        {FIELDS.map((f) => (
          <form key={f.key} method="POST" action="/api/settings" className="bg-white border border-slate-200 rounded-xl p-4 flex items-end gap-3 text-sm">
            <input type="hidden" name="key" value={f.key} />
            <div className="grow">
              <label className="font-medium block">{f.label}</label>
              <p className="text-xs text-slate-500">{f.help}</p>
            </div>
            {f.type === "boolean" ? (
              <select name="value" defaultValue={String(settings[f.key] ?? "false")} className="border border-slate-300 rounded px-2 py-1">
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            ) : (
              <input name="value" type={f.type} defaultValue={String(settings[f.key] ?? "")} className="border border-slate-300 rounded px-2 py-1 w-40" />
            )}
            <button className="bg-slate-900 text-white rounded px-4 py-1.5">Save</button>
          </form>
        ))}
      </div>
    </div>
  );
}
