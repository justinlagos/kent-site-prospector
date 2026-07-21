# Kent Site Prospector — Phased Implementation Checklist

Legend: [x] implemented & tested here · [~] implemented, needs real credentials to exercise live · [ ] not yet done

## Phase 1 — Foundation
- [ ] pnpm monorepo, strict TypeScript base config, ESLint/Prettier
- [ ] packages/shared: zod-validated config, structured JSON logger, error hierarchy, retry/backoff, adapter interfaces
- [ ] packages/database: full Prisma schema + initial migration against local Postgres 16
- [ ] Seed: Kent territories (28+ towns), 34 categories, rotation queue, default settings, policy document templates, admin user
- [ ] Vitest test framework wired at workspace root
- [ ] .env.example with every variable documented

## Phase 2 — Discovery & verification
- [ ] Territory rotation planner (queue-based, resumes week to week)
- [ ] BusinessDirectoryAdapter: Google Places (New) real + deterministic mock
- [ ] CompanyRegistryAdapter: Companies House real + mock
- [ ] EmailValidationAdapter: real (ZeroBounce-compatible) + heuristic mock
- [ ] Deduplication engine (provider ID + normalised name/postcode fingerprint)
- [ ] Generic-email preference; no guessing; personal addresses flagged, never auto-used

## Phase 3 — Audit & scoring
- [ ] robots.txt-respecting Playwright website auditor (single page, honest UA)
- [ ] 30+ objective checks → 6 sub-scores + opportunity score, evidence stored
- [ ] Screenshot service (mobile/tablet/desktop)
- [ ] Weighted prospect scorer (8 components, versioned)
- [ ] Disqualification engine (closed, chain, public body, suppressed, contacted, no contact route, recent good site, irrelevant)
- [ ] Daily pair selection incl. same-day close-competitor exclusion

## Phase 4 — Concept generation
- [ ] LlmAdapter: Claude (Anthropic SDK) real + deterministic mock
- [ ] Research brief generator with strict fact separation (verified / recommendations / unknown / placeholder)
- [ ] 15+ industry conversion-strategy modules
- [ ] Bespoke landing-page generator (semantic HTML, Tailwind via CDN-free inline CSS, noindex, disclaimer, OG, favicon)
- [ ] Asset-rights registry + publish gating
- [ ] ClaimsValidator blocking invented claims

## Phase 5 — Deployment
- [ ] QA pipeline (20+ checks incl. disclaimer, noindex, no leaked prior-prospect data, no unresolved variables, viewports, contact match)
- [ ] Screenshots at 390 / 768 / 1440 stored on the concept
- [ ] DeployAdapter: Netlify real + mock; random non-deceptive slugs; robots.txt + _headers
- [ ] Expiry manager: auto-unpublish at 30 days, manual extend, neutral expired page

## Phase 6 — Outreach
- [ ] Per-prospect email generator grounded in audit evidence, claims-validated
- [ ] EmailProviderAdapter: Postmark real + mock (.eml outbox)
- [ ] Signed HMAC one-click unsubscribe endpoint + List-Unsubscribe headers
- [ ] Bounce/complaint/reply webhook handling → immediate suppression + cancellation
- [ ] Idempotency keys, daily cap, weekday/business-hours enforcement, kill switch
- [ ] Follow-up engine present but disabled by default (explicit enable required)

## Phase 7 — Scheduling & reporting
- [ ] Weekday pipeline orchestrator with advisory locks, stage checkpointing, resume
- [ ] Dead-letter queue + replay
- [ ] Daily activity report + weekly analytics report generators
- [ ] GitHub Actions workflows (daily pipeline, hourly events/expiry)

## Phase 8 — Dashboard & hardening
- [ ] Next.js dashboard: Overview, Daily Queue, Prospects (+detail), Territories, Suppression, Settings
- [ ] Auth (Argon2id + sessions), RBAC, security headers, CSRF-safe mutations
- [ ] Webhook + unsubscribe API routes
- [ ] 15 critical-scenario automated tests green
- [ ] End-to-end fictional prospect run captured as example artifacts
- [ ] Full documentation set + README with exact commands
