# Example prospect — discovery to deployment (fictional data)

This directory captures one real execution of the pipeline in this repository, run
end-to-end with mock adapters against a local PostgreSQL database. Every business is
fictional (reserved `.example.com` domains); no external service was called and no email
left the machine.

## The run (2026-07-21, territory: Maidstone ME14, category: Dentists)

1. **Rotation** selected Maidstone (ME14) + Dentists — the head of the seeded queue.
2. **Discovery** (mock directory) returned 9 fictional dental practices; 8 imported after
   in-batch dedup, 1 skipped as permanently closed.
3. **Verification** (mock Companies House) matched the "Ltd/Limited" businesses to active
   companies; contacts passed mock email validation.
4. **Audit**: each website audited (mock audit path — deterministic findings per site
   quality); sub-scores + opportunity score stored with evidence.
5. **Scoring**: weighted 0–100 model; businesses with strong existing sites disqualified
   ("existing website is already strong (low opportunity)").
6. **Compliance gate**: all candidates evaluated; only active Ltds with validated generic
   emails received `CORPORATE_APPROVED`.
7. **Selection**: the two highest-scoring eligible prospects were selected
   ("Castle Dentist Limited", score 86 and "Oakwood Dentist Ltd", score 84 — fictional).
8. **Research brief** (`research-brief-and-copy.json`): note the strict separation of
   `verifiedFacts` (each with a source) from `designRecommendations`, `unknowns` and
   `placeholders`.
9. **Landing page** (`concept-index.html`): bespoke page per the dental-clinic strategy —
   appointment-first CTA, noindex/nofollow meta, always-visible disclaimer banner, SVG
   licensed-image placeholders, demonstration-only enquiry form.
10. **QA** (`qa-report.json`): 20+ checks, all green — including claims firewall, asset
    rights, disclaimer, viewport rendering and cross-prospect leak scan.
11. **Deployment** (mock Netlify): random non-deceptive slug `concept-6uxy9toxjpbt`,
    robots.txt disallow-all + X-Robots-Tag headers, 30-day expiry recorded.
12. **Email** (`outreach-email.txt`): individually generated from that prospect's audit
    evidence, claims-validated, with sender identification, why-contacted explanation,
    postal address and a signed one-click opt-out link.
13. **Send**: transmitted once by the mock provider at the randomised in-window time;
    a second send cycle transmitted nothing (idempotency verified).
14. **Report** (`daily-report.txt`): the day's activity summary.

To reproduce: `pnpm db:seed && pnpm worker -- --job daily` with the default mock
configuration in `.env.example`.
