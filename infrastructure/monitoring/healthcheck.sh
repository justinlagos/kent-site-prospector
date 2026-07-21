#!/usr/bin/env bash
# Simple operational healthcheck: verifies DB reachability and yesterday's run status.
set -euo pipefail
psql "$DATABASE_URL" -tAc "SELECT status FROM \"AutomationRun\" WHERE \"runType\"='daily-pipeline' ORDER BY \"startedAt\" DESC LIMIT 1"
