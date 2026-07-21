import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prisma = db();
  const b = await prisma.business.findUnique({
    where: { id },
    include: {
      category: true,
      territory: true,
      contacts: true,
      audits: { orderBy: { auditDate: "desc" } },
      scores: { orderBy: { calculatedAt: "desc" } },
      complianceRecords: { orderBy: { checkedAt: "desc" } },
      assets: true,
      concepts: { orderBy: { createdAt: "desc" } },
      outreachEmails: { orderBy: { createdAt: "desc" } },
      conversions: { orderBy: { updatedAt: "desc" } },
      suppressions: true,
    },
  });
  if (!b) notFound();
  const auditLogs = await prisma.auditLog.findMany({
    where: { entityId: id },
    orderBy: { at: "desc" },
    take: 50,
  });
  const audit = b.audits[0];
  const concept = b.concepts[0];
  const qa = (concept?.qaResults as Array<{ name: string; passed: boolean; critical: boolean; detail?: string }> | null) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{b.name}</h1>
          <p className="text-slate-500 text-sm">
            {b.address} · {b.postcode} · {b.category.label} · {b.legalForm}
            {b.companyNumber ? ` · Companies House ${b.companyNumber}` : ""}
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-slate-900 text-white text-sm">{b.status}</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section title="Discovery & sources">
          <dl className="text-sm grid grid-cols-2 gap-y-1">
            <dt className="text-slate-500">Source</dt><dd>{b.discoverySource}</dd>
            <dt className="text-slate-500">Source URL</dt><dd className="truncate">{b.sourceUrl ?? "—"}</dd>
            <dt className="text-slate-500">Discovered</dt><dd>{b.discoveredAt.toISOString().slice(0, 10)}</dd>
            <dt className="text-slate-500">Website</dt><dd className="truncate">{b.website ?? "none"}</dd>
            <dt className="text-slate-500">Phone</dt><dd>{b.phone ?? "—"}</dd>
            <dt className="text-slate-500">Reviews</dt><dd>{b.reviewCount ?? "—"} @ {b.reviewRating ?? "—"}</dd>
          </dl>
        </Section>

        <Section title="Contacts">
          <ul className="text-sm space-y-1">
            {b.contacts.map((c) => (
              <li key={c.id} className="flex gap-2 items-center">
                <span className="font-mono">{c.email}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100">{c.emailType}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${c.validationStatus === "VALID" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{c.validationStatus}</span>
              </li>
            ))}
            {b.contacts.length === 0 && <li className="text-slate-500">None on record</li>}
          </ul>
        </Section>

        <Section title="Website audit">
          {audit ? (
            <dl className="text-sm grid grid-cols-2 gap-y-1">
              <dt className="text-slate-500">Technical</dt><dd>{audit.technicalScore}</dd>
              <dt className="text-slate-500">Design</dt><dd>{audit.designScore}</dd>
              <dt className="text-slate-500">Conversion</dt><dd>{audit.conversionScore}</dd>
              <dt className="text-slate-500">Content</dt><dd>{audit.contentScore}</dd>
              <dt className="text-slate-500">SEO</dt><dd>{audit.seoScore}</dd>
              <dt className="text-slate-500">Trust</dt><dd>{audit.trustScore}</dd>
              <dt className="text-slate-500 font-semibold">Opportunity</dt><dd className="font-semibold">{audit.opportunityScore}</dd>
              <dt className="text-slate-500">robots.txt allowed</dt><dd>{audit.robotsAllowed ? "yes" : "no — page not loaded"}</dd>
            </dl>
          ) : <p className="text-sm text-slate-500">Not audited yet.</p>}
        </Section>

        <Section title="Prospect score">
          {b.scores[0] ? (
            <div className="text-sm space-y-2">
              <div className="text-3xl font-bold">{b.scores[0].totalScore}/100</div>
              {b.scores[0].disqualified && <p className="text-red-600">Disqualified: {b.scores[0].disqualificationReason}</p>}
              <pre className="bg-slate-50 rounded p-2 text-xs overflow-auto">{JSON.stringify(b.scores[0].componentScores, null, 2)}</pre>
            </div>
          ) : <p className="text-sm text-slate-500">Not scored yet.</p>}
        </Section>

        <Section title="Compliance">
          <ul className="text-sm space-y-2">
            {b.complianceRecords.map((c) => (
              <li key={c.id}>
                <span className={`font-semibold ${c.decision === "CORPORATE_APPROVED" ? "text-emerald-700" : "text-amber-700"}`}>{c.decision}</span>
                <span className="text-slate-500"> — {c.decisionReason} ({c.checkedAt.toISOString().slice(0, 10)}, notice v{c.privacyNoticeVersion})</span>
              </li>
            ))}
            {b.suppressions.filter((s) => !s.reversedAt).map((s) => (
              <li key={s.id} className="text-red-700 font-semibold">SUPPRESSED — {s.reason}</li>
            ))}
          </ul>
        </Section>

        <Section title="Concept & QA">
          {concept ? (
            <div className="text-sm space-y-2">
              <p>
                <span className="font-semibold">{concept.status}</span> · slug <code>{concept.slug}</code>
                {concept.previewUrl && <> · <a href={concept.previewUrl} target="_blank" rel="noreferrer nofollow" className="text-blue-600 hover:underline">preview ↗</a></>}
                {concept.expiresAt && <> · expires {concept.expiresAt.toISOString().slice(0, 10)}</>}
              </p>
              <details>
                <summary className="cursor-pointer font-medium">QA report ({qa.filter((c) => c.passed).length}/{qa.length} passed)</summary>
                <ul className="mt-2 space-y-1">
                  {qa.map((c) => (
                    <li key={c.name} className={c.passed ? "text-emerald-700" : "text-red-700"}>
                      {c.passed ? "✓" : "✗"} {c.name}{c.detail ? ` — ${c.detail}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : <p className="text-sm text-slate-500">No concept generated.</p>}
        </Section>

        <Section title="Outreach & events">
          <ul className="text-sm space-y-3">
            {b.outreachEmails.map((e) => (
              <li key={e.id} className="border border-slate-100 rounded-lg p-3">
                <div className="font-medium">{e.subject}</div>
                <div className="text-xs text-slate-500">
                  {e.status} · scheduled {e.scheduledAt?.toISOString() ?? "—"} · sent {e.sentAt?.toISOString() ?? "—"}
                  {e.repliedAt && ` · replied ${e.repliedAt.toISOString()}`}
                  {e.unsubscribedAt && ` · unsubscribed ${e.unsubscribedAt.toISOString()}`}
                </div>
                <details className="mt-1"><summary className="cursor-pointer text-xs">body</summary>
                  <pre className="bg-slate-50 rounded p-2 text-xs whitespace-pre-wrap">{e.bodyText}</pre>
                </details>
              </li>
            ))}
            {b.outreachEmails.length === 0 && <li className="text-slate-500">No outreach.</li>}
          </ul>
        </Section>
      </div>

      <Section title="Full history (audit log)">
        <ul className="text-xs font-mono space-y-1">
          {auditLogs.map((l) => (
            <li key={l.id}>{l.at.toISOString()} · {l.actor} · {l.action}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
