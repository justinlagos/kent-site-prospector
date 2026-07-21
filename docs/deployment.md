# Production deployment

## Components
1. **PostgreSQL** — any managed Postgres (16+). Set `DATABASE_URL`. Enable automated backups.
2. **Dashboard** — `apps/admin-dashboard` on any Node host: `pnpm --filter @ksp/admin-dashboard build && pnpm --filter @ksp/admin-dashboard start`. Put it behind HTTPS. Set `DASHBOARD_BASE_URL` to its public URL (unsubscribe links point here — it MUST be publicly reachable).
3. **Worker** — scheduled invocations of `node apps/worker/dist/main.js`:
   - `--job daily` weekdays 06:30 Europe/London
   - `--job hourly` hourly 08:00–17:00 Europe/London weekdays
   Copy `infrastructure/workflows/*.yml` to `.github/workflows/` for GitHub Actions, or use any cron host. Overlapping runs are safe (advisory locks + idempotency).

## Go-live checklist (in order)
1. `APP_ENV=production` — the app refuses to boot with mocks, missing agency identity or default secrets.
2. Set every `*_ADAPTER=real` + its credential (see api-integrations.md).
3. Fill the full agency identity (`AGENCY_*`).
4. Configure Postmark: verified sender domain, SPF + DKIM records, DMARC policy; separate outbound message stream; webhooks (Bounce, SpamComplaint, Delivery, Inbound) pointed at `https://<dashboard>/api/webhooks/postmark?token=<POSTMARK_WEBHOOK_TOKEN>`.
5. Only after DNS verification: `EMAIL_DOMAIN_AUTH_CONFIRMED=true`.
6. Generate 32+ char random `SESSION_SECRET` and `UNSUBSCRIBE_HMAC_SECRET`.
7. Complete + date the Legitimate Interests Assessment and privacy notice in the dashboard (Settings → policies) — see compliance.md.
8. Run one full day with `EMAIL_DRY_RUN=true`: verify concepts, previews and drafted emails in the dashboard.
9. Flip `EMAIL_DRY_RUN=false`. The first real sends occur in the next send window.
10. `pnpm --filter @ksp/database run migrate:deploy` is the production migration command (never `migrate:dev`).

## Rollback / halt
- Instant halt: set the **EMAIL KILL SWITCH** in dashboard Settings (any operator), or `EMAIL_KILL_SWITCH=true` in the environment.
- Deploys and discovery can keep running while sending is halted.
