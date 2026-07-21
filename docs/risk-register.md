# Kent Site Prospector — Risk Register

Version 1.0 — 2026-07-21. Reviewed at each phase gate. Likelihood/impact: L/M/H.

| # | Risk | L | I | Mitigation (implemented control) | Residual action |
|---|------|---|---|----------------------------------|-----------------|
| R1 | Unsolicited email sent to a sole trader / ordinary partnership (PECR breach — individual subscribers require consent) | M | H | Compliance engine only auto-approves incorporated bodies verified via Companies House; unknown legal forms → `MANUAL_REVIEW_REQUIRED`; send path re-checks decision at send time | Operator must review manual-review queue; keep LIA current |
| R2 | Contacting a suppressed person/company again | L | H | Permanent `Suppression` table keyed by email, domain and businessId; joined inside candidate selection AND re-checked in the send transaction; reversal requires ADMIN role and is audit-logged | Periodic export/audit of suppression list |
| R3 | Duplicate emails after worker crash/restart | M | H | Deterministic unique `idempotencyKey` per (business, contact, sequence) enforced by DB constraint; provider message-ID reconciliation before any retry | Monitor dead-letter queue |
| R4 | More than two first-contact emails in a weekday | L | H | Daily cap counted inside a serialised transaction under a Postgres advisory lock; cap value changeable only by ADMIN via Settings | Alert if cap reached unusually early |
| R5 | Preview mistaken for the business's official site (passing-off / misleading) | M | H | Mandatory always-visible disclaimer component (QA hard-fails if absent), `concept-{random}` slugs with a validator rejecting business-name-like slugs, noindex/nofollow + robots.txt disallow + X-Robots-Tag, no custom domains | Manual spot checks via dashboard screenshots |
| R6 | Invented claims (awards, prices, testimonials, health claims) in concept or email | M | H | Claims firewall: generators only receive the fact-separated ResearchBrief; post-generation ClaimsValidator blocks forbidden claim patterns; QA hard-fail | Human review of first N concepts per new category |
| R7 | Republishing images without rights | M | H | Asset-rights registry; social/Google-Images sources default `REFERENCE_ONLY`; QA cross-references every rendered asset against publishable statuses | Keep stock licence records current |
| R8 | Scraping in breach of robots.txt / site terms | M | M | Auditor fetches robots.txt first and aborts audit of disallowed paths; single-page load, no crawling beyond same-origin link HEAD checks; identifies itself with an honest UA string; no CAPTCHA/auth circumvention anywhere in the codebase | Respect any webmaster complaint immediately (suppress domain) |
| R9 | Guessed/fabricated email addresses | L | H | Only addresses returned by licensed sources are stored; generic-prefix preference; validation adapter must return deliverable before `CORPORATE_APPROVED`; no permutation logic exists | — |
| R10 | Personal data over-collection / retention breach (UK GDPR) | M | M | Data model restricted to public business data; retention sweeper anonymises rejected prospects after 90 days (configurable); versioned privacy notice + LIA templates shipped | Operator completes and dates the LIA before first real send |
| R11 | Sending outside UK business hours / weekends | L | M | Send executor checks Europe/London wall-clock day + hour window at execution time; scheduler only runs Mon–Fri | — |
| R12 | Spam-filter evasion behaviour damaging domain reputation | L | M | No pixel tracking by default, no misleading subjects, honest sender identity, SPF/DKIM/DMARC setup documented and asserted via config flags, Postmark complaint webhooks auto-suppress | Warm up sender domain gradually |
| R13 | Provider outage (Netlify / Postmark / Places / Claude) breaks the day's run | M | M | Retry with backoff; stage checkpointing preserves completed work (concept preserved if deploy fails; deploy preserved if email fails); dead-letter + partial-run resume | Status-page monitoring |
| R14 | Prospect data leaking between concepts (template bleed) | L | H | Concept generation is a pure function of one prospect's brief; QA scans rendered output for any other business's name/phone/postcode from the DB; test coverage | — |
| R15 | Dashboard compromise | L | H | Argon2id auth, RBAC, session cookies SameSite=Strict, CSRF-safe mutations, security headers/CSP, rate-limited login, secrets never rendered | Keep dependencies patched (audit in CI) |
| R16 | Legal-status misclassification (e.g. franchisee of a chain) | M | M | Chain/public-body exclusion heuristics + `MANUAL_REVIEW_REQUIRED` fallback; disqualification reasons stored for audit | Operator reviews rejects weekly |
| R17 | Objection/reply not honoured quickly | L | H | Inbound webhook processing suppresses on reply/complaint/unsubscribe immediately and cancels any scheduled sends for that business in the same transaction | Monitor inbound mailbox for non-webhook replies |
| R18 | Cost runaway (LLM / API quotas) | M | L | Two-prospect daily cap bounds all downstream usage; per-run token/cost logging; quota checks in adapters | Budget alert thresholds |
| R19 | Preview never expires (stale claims persist) | L | M | `expiresAt` on every concept; hourly job unpublishes overdue previews and swaps in neutral expired page; test coverage | — |
| R20 | Regulatory change (PECR/GDPR reform) | M | M | Compliance rules centralised in one engine with versioned decisions (`scoringVersion`, `privacyNoticeVersion`) so policy changes are one-file updates | Legal review cadence; this system's docs are not legal advice |

Note: the compliance documentation shipped with this system is an engineering implementation
of the operator's stated policy. It is not legal advice; the operator should have the LIA,
privacy notice and direct-marketing policy reviewed by a qualified adviser before first
production send.
