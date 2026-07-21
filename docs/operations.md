# Operations runbook

## Daily rhythm (all automatic)
06:30 pipeline: territory → discovery → verification → audits → scoring → compliance gate →
select 2 → briefs → pages → QA → deploy → queue emails. 10:15–15:30: hourly job transmits
each email at its randomised slot. EOD: daily report in `var/reports/` and the dashboard.

## What to check each morning (5 minutes)
1. Dashboard Overview — latest run stages all green?
2. Daily queue — two selected businesses look sensible? Preview links render correctly?
3. Replies — anything needing a human response? (Automation already stopped for repliers.)
4. Suppression — any new opt-outs/complaints? (Already honoured automatically.)

## Common operational tasks
- **Pause a category/territory**: set status PAUSED via DB or dashboard; rotation skips it.
- **Extend a preview**: prospect detail → concept → extend expiry (audit-logged).
- **Manual suppression**: Suppression page → add by email or domain.
- **Reverse suppression**: ADMIN only, written reason required, audit-logged.
- **Replay a failed stage**: re-run `--job daily` — completed stages skip, failed stages retry.
  Dead letters are listed per run in the DB (`DeadLetter`) with payloads.
- **Change daily volume**: Settings → daily first-contact limit (ADMIN). The cap is enforced
  in the DB send transaction — no code path can exceed it.

## Monitoring
- Structured JSON logs on stdout — ship to your aggregator.
- `SENTRY_DSN` enables error monitoring (optional).
- `infrastructure/monitoring/healthcheck.sh` returns the latest run status for probes.
- Alert conditions worth wiring: run status FAILED/PARTIAL, unresolved DeadLetter rows,
  bounce rate > 5%, provider webhook 401s.
