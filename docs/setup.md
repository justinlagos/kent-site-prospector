# Setup

## Prerequisites
- Node.js ≥ 20, pnpm ≥ 9 (`corepack enable`)
- PostgreSQL 16 (local or hosted)
- Playwright Chromium: `npx playwright install --with-deps chromium`

## Steps
```bash
git clone <your-repo-url> kent-site-prospector && cd kent-site-prospector
pnpm install
createdb ksp && createdb ksp_test          # or use docker: docker run -e POSTGRES_PASSWORD=... -p 5432:5432 postgres:16
cp .env.example .env                        # fill in DATABASE_URL at minimum
pnpm db:migrate                             # applies prisma migrations (dev)
pnpm db:seed                                # Kent territories, categories, rotation queue, policies, admin user
pnpm build
pnpm test                                   # 51 tests incl. the 15 critical scenarios (needs ksp_test DB)
```

First login: the seed creates `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`
(defaults `admin@example.com` / `change-me-immediately`). **Change this immediately** via a
new AdminUser row or by re-seeding with real values set in the environment.

Everything runs with mock adapters by default — the pipeline works fully offline and can
never send a real email until you deliberately configure it (see deployment.md).
