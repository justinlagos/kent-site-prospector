# Privacy & retention

## Data inventory
Business identity and public contact data only (name, registered details, address,
business phone, generic business email, website, public review aggregates, opening hours).
No special-category data. Personal-looking emails are stored flagged PERSONAL solely to
prevent accidental use — they are never auto-contacted.

## Retention (enforced by the daily retention sweeper)
| Data | Default | Mechanism |
|---|---|---|
| Rejected/never-contacted prospects | 90 days | contacts deleted; phone/email nulled; status ANONYMISED; audit-logged |
| Contacted prospects | life of relationship | manual/deletion workflow |
| Suppression rows | indefinite (minimal fields) | never swept — they exist to prevent contact |
| Previews | unpublished at 30 days | hourly expiry job replaces with neutral page |
| Reports/screenshots | operator-managed `var/` | documented cleanup in operations.md |

## Individual rights
Signed one-click opt-out on every email; objection = permanent suppression; erasure =
anonymisation + suppression stub (explained to the requester); access = prospect-detail
export. Workflows are seeded as versioned PolicyDocuments (dsr-workflow,
objection-workflow, deletion-workflow) and editable in the dashboard.

## Tracking
Open/click tracking is OFF by default (`TrackOpens: false`, `TrackLinks: "None"`). QA fails
any concept containing an analytics tracker unless a documented purpose has been recorded
in settings. `openedAt`/`clickedAt` fields stay null unless that documented purpose exists.
