# Security

## Authentication & authorisation
- Dashboard: scrypt password hashes (timing-safe compare), HMAC-signed HttpOnly
  SameSite=Strict session cookies (12 h), login rate limiting (10/15 min per IP+email).
- RBAC: OPERATOR vs ADMIN. ADMIN-only: suppression reversal, daily-cap change, follow-up
  enablement, chain/public-body enablement, kill-switch resume. Anyone can HALT sending.
- Webhooks: shared-token authentication (`POSTMARK_WEBHOOK_TOKEN`); unauthenticated
  requests rejected 401 and nothing processed.
- Unsubscribe: HMAC-SHA256 tokens; constant-time verification; no session required.

## Application hardening
- Strict CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, X-Robots-Tag on every
  dashboard response (next.config.mjs).
- All external input zod-validated or type-narrowed at the boundary; Prisma parameterised
  queries throughout (no string SQL with user input).
- Output encoding: all business-derived strings HTML-escaped before rendering into
  concepts (see `esc()` in landing-page.ts).
- Secrets only via environment; logger redacts key/token/secret/password fields;
  `.env` git-ignored; production refuses default secrets.
- Least privilege: give the app's DB user only the `ksp` schema; the dashboard needs no
  provider credentials except Postmark webhook token verification.

## Supply chain & ops
- `pnpm audit` in CI recommended; lockfile committed; renovate/dependabot advised.
- Database backups: use your host's PITR; test restores quarterly.
- Incident response: seeded procedure (kill switch first, rotate secrets, assess, ICO
  72-hour assessment if personal-data breach) — see PolicyDocument `incident-response`.
