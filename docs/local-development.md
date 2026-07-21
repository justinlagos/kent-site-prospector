# Local development

```bash
pnpm dashboard            # Next.js dashboard on http://localhost:3000
pnpm worker -- --job daily    # run today's pipeline (idempotent — safe to re-run)
pnpm worker -- --job hourly   # due sends, expiry, retention, weekly report
pnpm test:watch           # vitest watch mode
pnpm typecheck            # strict TS across the workspace
pnpm lint
```

Useful dev facts:
- Mock outputs land in `var/`: `var/outbox/*.eml` (would-be emails), `var/deploys/<slug>/`
  (would-be Netlify sites), `var/screenshots/`, `var/reports/`.
- The mock directory generates deterministic fictional businesses per (town, category),
  with a fixed mix of weak/average/strong/no-website sites, so runs are reproducible.
- Send timing: sends only execute Mon–Fri within the configured Europe/London window.
  In tests a fixed `LondonClock` is injected; for manual experiments you can widen
  `SEND_WINDOW_*` or call `processScheduledSends` with a custom clock (see
  `apps/worker/src/scenarios.test.ts` for examples).
- Reset the dev day: truncate the transactional tables (see `resetData()` in the test
  file) or drop/recreate the `ksp` database and re-seed.
