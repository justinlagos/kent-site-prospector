/**
 * Versioned compliance/privacy document templates seeded into PolicyDocument.
 * Editable in the dashboard; edits create new versions. These are engineering templates,
 * not legal advice — the operator should have them reviewed before first production send.
 */

export interface PolicyTemplate {
  key: string;
  version: string;
  title: string;
  bodyMd: string;
}

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    key: "privacy-notice",
    version: "1.0",
    title: "Privacy Notice (B2B prospecting)",
    bodyMd: `# Privacy Notice — Business Prospecting

**Who we are.** {AGENCY_NAME}, {AGENCY_POSTAL_ADDRESS} ({AGENCY_WEBSITE}, {AGENCY_PHONE}).

**What we collect.** Publicly available business information: business name, registered
company details (from Companies House), business address, business phone number, generic
business email addresses (e.g. info@), website address, public review counts/ratings and
opening hours. We do not collect special-category data and we do not guess email addresses.

**Where it comes from.** Licensed business directory APIs (recorded per record), Companies
House, and the business's own public website.

**Why we process it.** Legitimate interests (Article 6(1)(f) UK GDPR): offering relevant
web-design services to incorporated businesses. Our Legitimate Interests Assessment is
available on request. We only send unsolicited marketing email to corporate subscribers as
permitted by PECR Regulation 22; sole traders and ordinary partnerships are excluded from
automated outreach.

**How long we keep it.** Prospects we do not contact: personal data removed after
{RETENTION_REJECTED_DAYS} days. Contacted prospects: for the duration of the business
relationship or until objection. Suppression records: retained indefinitely (minimal data)
to guarantee we never contact you again.

**Your rights.** Access, rectification, erasure, restriction, objection, portability.
Contact {AGENCY_REPLY_TO_EMAIL} or write to us. Every email we send contains a one-click
opt-out. You can complain to the ICO (ico.org.uk).`,
  },
  {
    key: "direct-marketing-policy",
    version: "1.0",
    title: "Internal Direct-Marketing Policy",
    bodyMd: `# Internal Direct-Marketing Policy

1. Automated unsolicited email may be sent ONLY to corporate subscribers (limited companies,
   LLPs, PLCs and other incorporated bodies) verified via Companies House.
2. Sole traders, ordinary partnerships and unknown legal forms are never auto-emailed. They
   require recorded consent or an individually documented lawful basis and manual approval.
3. Maximum {DAILY_LIMIT} first-contact emails per weekday. No weekend sending. Sends only
   within UK business hours (Europe/London).
4. Every email identifies the sender, explains why the business was contacted, includes a
   valid postal address and a one-click opt-out.
5. Any reply, unsubscribe, complaint, hard bounce or objection immediately and permanently
   stops automated contact with that person, address, domain and company.
6. Follow-ups are disabled by default. If enabled by an administrator: maximum one polite
   follow-up after 5–7 working days, none thereafter without engagement.
7. No tracking pixels by default. Open tracking requires a documented purpose recorded in
   settings before activation.
8. Suppression reversals require an ADMIN account and are audit-logged with a reason.`,
  },
  {
    key: "lia-template",
    version: "1.0",
    title: "Legitimate Interests Assessment (template)",
    bodyMd: `# Legitimate Interests Assessment — Website-Design B2B Outreach

**Date completed:** [DATE] · **Completed by:** [NAME] · **Review date:** [DATE +12 months]

## 1. Purpose test
- Interest: offering website-design services to incorporated Kent businesses whose public
  web presence shows objective improvement opportunities.
- Benefits: to us — new business; to the recipient — a concrete, no-obligation demonstration
  relevant to their business; societal — improved accessibility and usability of local
  business websites.

## 2. Necessity test
- Direct email to a generic business address is the least intrusive effective channel.
- Data minimised to public business contact data; no profiling of individuals; two contacts
  per day maximum across the whole system.

## 3. Balancing test
- Data subjects: staff reading generic business mailboxes, in a business capacity.
- Reasonable expectations: businesses publishing a public contact address expect relevant
  B2B correspondence.
- Impact: minimal — a single concise email with a clear opt-out honoured permanently.
- Safeguards: corporate-subscriber-only automation, suppression list, no personal-address
  guessing, PECR-compliant sender identification, retention limits.

**Outcome:** [PASS / FAIL — sign and date]`,
  },
  {
    key: "retention-policy",
    version: "1.0",
    title: "Data-Retention Policy",
    bodyMd: `# Data-Retention Policy

| Data | Retention | Action at end |
|---|---|---|
| Rejected/never-contacted prospects | {RETENTION_REJECTED_DAYS} days | Anonymise personal fields (emails, contact names, phone) |
| Contacted prospects | Life of relationship + 24 months | Anonymise |
| Website audit evidence | While commercially necessary (default 24 months) | Delete |
| Suppression records | Indefinite (minimum data: email/domain hash + reason + date) | — |
| Concepts/previews | Unpublish at {PREVIEW_EXPIRY_DAYS} days; artifacts deleted after 12 months | Delete |
| Email event data | 24 months for the documented purpose of deliverability + compliance evidence | Delete |
| Audit log | 6 years | Archive |

The retention sweeper runs daily and records every anonymisation in the audit log.`,
  },
  {
    key: "data-source-register",
    version: "1.0",
    title: "Data-Source Register",
    bodyMd: `# Data-Source Register

| Source | Data obtained | Licence/basis | Recorded per record |
|---|---|---|---|
| Google Places API (New) | Business identity, address, phone, website, ratings, hours | Google Maps Platform ToS (permitted use; no scraping) | discoverySource, sourceUrl, discoveredAt |
| Companies House API | Legal name, number, form, status, registered address | Open Government Licence | source URL on ComplianceRecord |
| Business's own website | Services, brand cues, contact email published by the business | Publicly published by the controller; robots.txt respected | audit evidenceJson |
| Email validation provider | Deliverability verdict | Provider ToS | validationStatus, validationDetail |

Adding any new source requires an entry here (new version) BEFORE first use.`,
  },
  {
    key: "dsr-workflow",
    version: "1.0",
    title: "Data-Subject Request Workflow",
    bodyMd: `# Data-Subject Request (DSR) Workflow

1. Requests arrive at {AGENCY_REPLY_TO_EMAIL} or by post. Log receipt date (1-month clock).
2. Verify the requester controls the email address concerned (reply-to confirmation).
3. **Access:** export all rows for the matching Business/Contact via the dashboard prospect
   detail export.
4. **Erasure:** anonymise the Business/Contact records; retain a suppression row (email hash,
   reason LEGAL) so they are never re-imported — explain this to the requester.
5. **Objection:** treat identically to unsubscribe: immediate permanent suppression.
6. Record completion in the audit log with the request reference.`,
  },
  {
    key: "objection-workflow",
    version: "1.0",
    title: "Objection Workflow",
    bodyMd: `# Objection / Opt-out Workflow

Automated paths (no human latency):
- One-click unsubscribe link → immediate suppression (email + business) + cancellation of
  scheduled sends.
- Postmark complaint webhook → suppression (email + domain + business).
- Hard bounce → suppression (email).
- Any reply → automated sends stop; classified in dashboard; if the reply objects, operator
  adds explicit OBJECTION suppression.

Manual path: objection received by phone/post → operator adds suppression from the dashboard
same working day. Suppression is permanent unless reversed by an ADMIN with an audit-logged
reason (e.g. the person explicitly re-requested contact).`,
  },
  {
    key: "deletion-workflow",
    version: "1.0",
    title: "Deletion Workflow",
    bodyMd: `# Deletion Workflow

1. Identify scope: single contact, business, or bulk (retention sweep).
2. Anonymise rather than hard-delete where referential integrity or suppression guarantees
   require it: null personal fields, set status ANONYMISED, keep non-personal aggregates.
3. Delete stored artifacts (screenshots, generated HTML) for the scope.
4. Netlify previews for the scope are unpublished/deleted.
5. Write an audit-log entry per entity. The retention sweeper automates steps 2–5 daily.`,
  },
  {
    key: "incident-response",
    version: "1.0",
    title: "Incident-Response Procedure",
    bodyMd: `# Incident-Response Procedure

1. **Detect & contain** — set EMAIL_KILL_SWITCH=true (dashboard Settings or env) to halt all
   outbound activity. Revoke any exposed credentials.
2. **Assess** — what data, whose, how many records, ongoing risk? Record a timeline.
3. **Notify** — if a personal-data breach is likely to risk individuals' rights: ICO within
   72 hours; affected individuals without undue delay if high risk.
4. **Remediate** — patch, rotate secrets, verify suppression list integrity, re-run QA.
5. **Post-mortem** — written within 5 working days; actions tracked to completion; this
   document version-bumped with lessons learned.`,
  },
];
