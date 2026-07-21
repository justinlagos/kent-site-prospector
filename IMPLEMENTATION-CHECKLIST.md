# Kent Site Prospector — Phased Implementation Checklist

Legend: [x] implemented & tested here · [~] implemented, needs real credentials to exercise live · [ ] not yet done

## Phase 1 — Foundation
- [x] pnpm monorepo, strict TypeScript base config, ESLint/Prettier
- [x] packages/shared: zod-validated config, structured JSON logger, error hierarchy, retry/backoff, adapter interfaces
- [x] packages/database: full Prisma schema + initial migration against local Postgres 16
- [x] Seed: Kent territories (28+ towns), 34 categories, rotation queue, default settings, policy document templates, admin user
- [x] Vitest test framework wired at workspace root
- [x] .env.example with every variable documented

## Phase 2 — Discovery & verification
- [x] Territory rotation planner (queue-based, resumes week to week)
- [~] BusinessDirectoryAdapter: Google Places (New) real + deterministic mock
- [~] CompanyRegistryAdapter: Companies House real + mock
- [~] EmailValidationAdapter: real (ZeroBounce-compatible) + heuristic mock
- [x] Deduplication engine (provider ID + normalised name/postcode fingerprint)
- [x] Generic-email preference; no guessing; personal addresses flagged, never auto-used

## Phase 3 — Audit & scoring
- [x] robots.txt-respecting Playwright website auditor (single page, honest UA)
- [x] 30+ objective checks → 6 sub-scores + opportunity score, evidence stored
- [x] Screenshot service (mobile/tablet/desktop)
- [x] Weighted prospect scorer (8 components, versioned)
- [x] Disqualification engine (closed, chain, public body, suppressed, contacted, no contact route, recent good site, irrelevant)
- [x] Daily pair selection incl. same-day close-competitor exclusion

## Phase 4 — Concept generation
- [~] LlmAdapter: Claude API real + deterministic mock
- [x] Research brief generator with strict fact separation (verified / recommendations / unknown / placeholder)
- [x] 15+ industry conversion-strategy modules
- [x] Bespoke landing-page generator (semantic HTML, Tailwind via CDN-free inline CSS, noindex, disclaimer, OG, favicon)
- [x] Asset-rights registry + publish gating
- [x] ClaimsValidator blocking invented claims

## Phase 5 — Deployment
- [x] QA pipeline (20+ checks incl. disclaimer, noindex, no leaked prior-prospect data, no unresolved variables, viewports, contact match)
- [x] Screenshots at 390 / 768 / 1440 stored on the concept
- [~] DeployAdapter: Netlify real + mock; random non-deceptive slugs; robots.txt + _headers
- [x] Expiry manager: auto-unpublish at 30 days, manual extend, neutral expired page

## Phase 6 — Outreach
- [x] Per-prospect email generator grounded in audit evidence, claims-validated
- [~] EmailProviderAdapter: Postmark real + mock (.eml outbox)
- [x] Signed HMAC one-click unsubscribe endpoint + List-Unsubscribe headers
- [x] Bounce/complaint/reply webhook handling → immediate suppression + cancellation
- [x] Idempotency keys, daily cap, weekday/business-hours enforcement, kill switch
- [x] Follow-up engine present but disabled by default (explicit enable required)

## Phase 7 — Scheduling & reporting
- [x] Weekday pipeline orchestrator with advisory locks, stage checkpointing, resume
- [x] Dead-letter queue + replay
- [x] Daily activity report + weekly analytics report generators
- [x] GitHub Actions workflows (daily pipeline, hourly events/expiry)

## Phase 8 — Dashboard & hardening
- [x] Next.js dashboard: Overview, Daily Queue, Prospects (+detail), Territories, Suppression, Settings
- [x] Auth (scrypt + HMAC sessions), RBAC, security headers, CSRF-safe mutations
- [x] Webhook + unsubscribe API routes
- [x] 15 critical-scenario automated tests green
- [x] End-to-end fictional prospect run captured as example artifacts
- [x] Full documentation set + README with exact commands
