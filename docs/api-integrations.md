# API integrations

Every integration is an adapter with a `real` and `mock` implementation, selected by env.
Production refuses mocks. All real adapters: exponential backoff + jitter on 429/5xx,
fatal on other 4xx, honest identification, no scraping fallbacks.

| Adapter | Env selector | Credential | Where to get it |
|---|---|---|---|
| Google Places (New) `places:searchText` | `DIRECTORY_ADAPTER` | `GOOGLE_PLACES_API_KEY` | Google Cloud console → enable "Places API (New)" → API key restricted to it |
| Companies House REST | `REGISTRY_ADAPTER` | `COMPANIES_HOUSE_API_KEY` | developer.company-information.service.gov.uk → create application (free) |
| Email validation (ZeroBounce-compatible) | `EMAIL_VALIDATION_ADAPTER` | `EMAIL_VALIDATION_API_KEY` (+ optional `EMAIL_VALIDATION_API_URL`) | zerobounce.net or compatible |
| Claude API | `LLM_ADAPTER` | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | console.anthropic.com |
| Netlify | `DEPLOY_ADAPTER` | `NETLIFY_API_TOKEN` | app.netlify.com → User settings → Applications → personal access token |
| Postmark | `EMAIL_PROVIDER_ADAPTER` | `POSTMARK_SERVER_TOKEN`, `POSTMARK_MESSAGE_STREAM`, `POSTMARK_WEBHOOK_TOKEN` | postmarkapp.com → server → API tokens; configure webhooks per deployment.md |

Swapping vendors: implement the interface in `packages/shared/src/adapters.ts`
(`BusinessDirectoryAdapter`, `CompanyRegistryAdapter`, `EmailValidationAdapter`,
`LlmAdapter`, `DeployAdapter`, `EmailProviderAdapter`) and register it in
`apps/worker/src/adapters.ts`. Nothing else changes.

Quotas & cost notes: the two-prospect daily cap bounds all downstream usage — per weekday
roughly: 1 Places text search, ≤20 Companies House lookups, ≤20 validations, ≤20 page
audits, 6 Claude completions, 2 Netlify deploys, 2 emails.
