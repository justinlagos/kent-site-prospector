# Kent Site Prospector

A production-grade, compliance-first outbound website-design prospecting pipeline for Kent,
UK. Each weekday it rotates to the next territory + business category, discovers businesses
through licensed APIs, verifies legal form at Companies House, audits existing websites,
scores prospects, and — for exactly **two** compliance-approved businesses — generates a
bespoke landing-page concept, deploys it to a private noindexed preview, and sends one
personalised, fully identified outreach email with a signed one-click opt-out. Every action
is logged; every stop-signal (reply, bounce, complaint, unsubscribe, objection) suppresses
permanently and immediately.

**Safety is structural, not procedural**: the daily cap, suppression checks, weekday/UK
business-hours rules and duplicate-send prevention are enforced in PostgreSQL (unique
idempotency keys, advisory-locked transactions) and re-checked at the moment of send. The
system boots with mock adapters and dry-run sending by default and physically refuses
production execution until real credentials, agency identity and email authentication are
configured.

## Quick start (offline, mock mode — no credentials needed)

```bash
corepack enable                                   # pnpm
npx playwright install --with-deps chromium       # for audits/QA screenshots
createdb ksp && createdb ksp_test                 # PostgreSQL 16
cp .env.example .env                              # set DATABASE_URL
pnpm install
pnpm db:migrate
pnpm db:seed          # 39 Kent territories, 35 categories, 1365-pair rotation queue,
                      # policy templates, settings, initial admin
pnpm build
pnpm test             # 51 tests incl. all 15 critical acceptance scenarios
pnpm worker -- --job daily     # run a full (mock) day: discover → audit → score →
                               # comply → select 2 → generate → QA → deploy → queue emails
pnpm worker -- --job hourly    # transmit due (mock) emails, expire previews, retention
pnpm dashboard                 # admin dashboard on http://localhost:3000
```

Mock artifacts land in `var/`: would-be emails in `var/outbox/*.eml`, would-be Netlify
sites in `var/deploys/<slug>/`, reports in `var/reports/`. A captured example run lives in
`docs/example-run/`.

Dashboard login: `admin@example.com` / `change-me-immediately` (change immediately —
see docs/setup.md).

## Going to production

Work through **docs/deployment.md** — in short: real credentials for Google Places,
Companies House, an email-validation provider, the Claude API, Netlify and Postmark; full
agency identity; SPF/DKIM/DMARC verified; LIA and privacy notice completed; then, and only
then, `EMAIL_DRY_RUN=false`. `APP_ENV=production` hard-refuses mocks, placeholder identity
and default secrets. `EMAIL_KILL_SWITCH` (env or dashboard) halts all sending instantly.

## Repository map

```
apps/worker              weekday pipeline + hourly events (locks, retries, dead letters)
apps/admin-dashboard     Next.js dashboard, unsubscribe endpoint, Postmark webhooks
packages/shared          config safety-locks, adapters interfaces, logging, errors, time
packages/database        Prisma schema, migrations, Kent seed data, policy templates
packages/discovery       rotation planner, Places/Companies House/validation adapters, dedup
packages/compliance      decision engine (PECR corporate-subscriber model), suppression
packages/auditing        robots-respecting Playwright website auditor + scoring
packages/scoring         weighted prospect scorer, disqualification, daily pair selection
packages/research        fact-provenance research briefs, Claude + mock LLM adapters
packages/content-generation  23 industry strategies, claims firewall, page renderer
packages/asset-management    asset-rights registry and publish gating
packages/deployment      QA pipeline (20+ checks), Netlify + mock deploy, expiry manager
packages/email           per-prospect email generation, Postmark + mock, layered send path
packages/analytics       daily and weekly reports
docs/                    architecture, data model, risk register, compliance, ops, security
infrastructure/          GitHub Actions schedules, monitoring
```

## Key commands

```bash
pnpm build | pnpm typecheck | pnpm lint | pnpm test
pnpm db:migrate    # dev migrations        pnpm db:deploy   # production migrations
pnpm db:seed       # idempotent seed
pnpm worker -- --job daily|hourly
pnpm dashboard
```

## Documentation

`docs/architecture.md` (system + Mermaid diagrams) · `data-model.md` (ERD) ·
`risk-register.md` · `setup.md` · `local-development.md` · `deployment.md` ·
`operations.md` · `compliance.md` · `privacy.md` · `security.md` ·
`api-integrations.md` · `troubleshooting.md` · `example-run/` ·
`IMPLEMENTATION-CHECKLIST.md`

> The compliance documentation describes engineering controls; it is not legal advice.
> Have the seeded LIA, privacy notice and marketing policy reviewed by a qualified adviser
> before the first production send.
