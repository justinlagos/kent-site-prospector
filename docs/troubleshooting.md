# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| App refuses to boot in production | mock adapter selected / missing agency identity / default secrets | The error names the exact variable. This is the safety design, not a bug. |
| `send cycle skipped: real sending not allowed` | dry-run on, domain auth unconfirmed, or identity incomplete | Work through the go-live checklist in deployment.md |
| No emails despite green pipeline | outside Mon–Fri 10:00–15:59 Europe/London window | Wait for the window; the hourly job transmits due emails |
| Pipeline stage FAILED | see `AutomationStage.error` + `DeadLetter.payload` | Fix cause, re-run `--job daily` — completed stages skip |
| `Rotation queue is exhausted` | every (territory, category) pair scanned | Add territories/categories, or reset chosen pairs to PENDING |
| Playwright launch error | browser revision mismatch | `npx playwright install chromium`, or set `KSP_CHROMIUM_EXECUTABLE=/path/to/chrome` |
| QA fails `no-invented-claims` | generated copy contained an unverifiable claim | Working as intended — inspect qaResults detail; regenerate (mock LLM is deterministic; real LLM will vary) |
| QA fails `assets-publishable` | concept references an unregistered/rights-restricted asset | Register the asset with a publishable status or remove it |
| Duplicate business rows | should be impossible (DB unique constraints) | If a provider changed IDs, dedupFingerprint still blocks; check `normaliseName` |
| Webhook 401s | token mismatch | Postmark webhook URL must include `?token=` matching `POSTMARK_WEBHOOK_TOKEN` |
| Email sent twice | should be impossible | idempotencyKey is DB-unique + provider reconciliation; check you haven't deleted rows manually |
| Prisma migrate errors in prod | using `migrate:dev` | Use `pnpm --filter @ksp/database run migrate:deploy` |
