# Compliance model

> Engineering documentation of the system's controls. Not legal advice — have your LIA,
> privacy notice and direct-marketing policy reviewed by a qualified adviser before the
> first production send.

## Legal framing (UK)
- **PECR reg. 22**: unsolicited marketing email to *individual subscribers* (incl. sole
  traders and ordinary partnerships) requires prior consent. *Corporate subscribers*
  (companies, LLPs) may be emailed subject to sender identification and opt-out.
- **UK GDPR art. 6(1)(f)**: processing of business-contact personal data under legitimate
  interests, supported by a completed LIA (template seeded in the PolicyDocument table).

## How the code enforces it
| Control | Implementation |
|---|---|
| Corporate-only automation | `evaluateProspect()` — only Companies-House-verified LTD/LLP/PLC/CHARITY can reach `CORPORATE_APPROVED`; sole traders → `CONSENT_REQUIRED`; unknown → `MANUAL_REVIEW_REQUIRED`; both excluded from automation |
| Permanent suppression | `Suppression` table joined in candidate selection AND re-checked inside the send transaction; unsubscribe/complaint/hard-bounce/objection all write it; reversal is ADMIN + reason + audit log |
| Two per weekday | counted under a Postgres advisory lock in the send transaction; weekday + Europe/London business hours checked at the moment of send |
| Sender identification | every email carries name, agency, website, phone, postal address, why-contacted wording; enforced by the generator template |
| One-click opt-out | HMAC-signed token; `List-Unsubscribe` + `List-Unsubscribe-Post` headers; GET/POST endpoint honours instantly with no login |
| No fabricated claims | fact-provenance ResearchBrief + ClaimsValidator on pages AND emails; QA hard-fails |
| No deceptive previews | `concept-{random}` slugs (validator rejects business-name tokens), permanent disclaimer banner, noindex/nofollow/X-Robots-Tag/robots.txt, 30-day auto-expiry |
| Asset rights | third-party-sourced images forced to REFERENCE_ONLY; QA blocks non-publishable assets |
| Respectful collection | licensed APIs only; robots.txt honoured before any page load; honest bot UA; no CAPTCHA/auth circumvention anywhere; emails never guessed |
| Data minimisation & retention | rejected prospects anonymised after 90 days (configurable); suppression rows keep only what's needed to keep suppressing |

## Operator responsibilities (cannot be automated)
1. Complete, sign and date the LIA before first send; review annually.
2. Publish the privacy notice at your website and keep the seeded version in sync.
3. Review the MANUAL_REVIEW queue — never bulk-approve.
4. Answer replies personally; record objections received by phone/post same working day.
5. Handle data-subject requests per the seeded DSR workflow (1-month clock).
