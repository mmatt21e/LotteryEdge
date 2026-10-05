# Personal-use maintenance, October 5, 2026

Changes are local. No deployment, push, broad collection, purchases, source-block bypass or browser-storage migration was performed.

## Corrected behavior

- Georgia uses the official published display-dollar table, replacing the retired API unit assumption. Game 1423 is $3,000,000 at $20 per ticket. Non-cash descriptions remain text with no invented cash value. Multiple rows for a game retain the highest published numeric prize. The observed source date is September 27, 2026, so the new observation remains stale on October 5.
- `data/corrections-v1.json` provides a versioned observation overlay for older Georgia snapshots. It records verification time, source date, source URL and source HTML SHA-256. It does not divide or rewrite historical money values. Games absent from the current source, including 1800, are not guessed back into the corrected listing.
- Full-game estimates reject inconsistent counts, missing/contradictory ticket anchors, duplicate or unsupported prize tiers, impossible denominators and inconsistent EV totals. Invalid records appear in an exclusion disclosure instead of ranking as zero EV. A prior artificial 95% payout floor was removed: inconsistent source evidence requires review.
- Iowa's adapter explicitly lists only $50+ prizes. Complete-ladder EV is unavailable for that adapter. Other conflicting records remain withheld pending source reconciliation.
- Stale snapshots (over 48 hours), reporting dates older than two local calendar days, future/invalid timestamps and failed latest collections are withheld from current full-game rankings, trends and alerts. Lite historical listings remain visibly labeled historical and unsorted when stale.
- Source metadata shows the true import timestamp separately from results/reporting date. Reliable explicit source dates take precedence. Otherwise the previous local calendar day is labeled **Assumed reporting date**. This does not claim the provider actually updated yesterday. Failed attempts retain old snapshot dates. Combined rankings show the date range of included sources and individual source status.
- Configured source time zones are in `shared/quality.ts`. These represent publisher default zones, including states spanning multiple zones; unknown sources default to UTC. Calendar arithmetic, rather than subtracting 24 hours from a timestamp, handles DST and month/year boundaries.
- Legacy history is projected one calendar day earlier for display and labeled assumed. Its stored UTC snapshot-date key remains available as `snapshotDate`. Legacy files lack per-point import timestamps, so a more precise local-day reconstruction is not possible. Future points include actual import time and reporting metadata. Winner publication/claim dates are not shifted.
- Partial printed probability ladders, exhausted prize tiers and invalid denominators return unavailable. Current modeled odds do not fall back to printed odds. A mature game alone no longer earns high confidence. Gross return and net return are distinguished, and unclaimed prizes are not presented as measured unsold stock. Daily prize deltas are withheld for gaps, tier changes and upward revisions. Illustrative history is no longer inserted into real rankings.
- Source fetches are canceled on state switches. Failed refreshes retain the timestamped snapshot while withholding rankings. Selected details resolve against the current validated game list.

## Preservation

Existing root `data` snapshots, histories, posted winners and status files were left byte-for-byte unchanged during this repair. New data consists of the correction overlay and an immutable Nebraska PDF observation. Future collector writes first archive their previous published snapshot and previous history under `data/observations-v1/<state>/`, alongside immutable new observations. A targeted Nebraska PDF observation was imported on October 5; no full multi-state collector run was performed.

Ledger/favorites storage code and winner-loading code are unchanged. Browser QA used separate localhost origins, without touching hosted-site storage. Preexisting `graphify-out/` remains untouched. Original source backups and before/after hashes are retained in the external repair evidence folder.

## Validation and limitations

Offline tests cover the original five invalid Ohio/Massachusetts records, official Georgia published rows, unsupported EV anchors, gross/net identities, malformed probability inputs, stale/failed feeds, mixed source dates, September 2 to September 1, DST, timezone and month/year boundaries, explicit source precedence, and history preservation. The web production build includes both TypeScript projects.

The local checkout still contains its original August 22 snapshots. Starting it now correctly displays these as stale. Browser QA also used a separate preview of public snapshots captured during the audit on October 5; those captured files were not substituted for repository history or raw snapshots.

Nebraska now uses its official dated PDF report (26 limited-data games); the retired mobile HTML endpoint is no longer used. Arkansas is paused after a Cloudflare HTTP 403 challenge. Connecticut is paused because its terms explicitly prohibit automatic scraping. Oklahoma is paused pending review of the written-authorization requirement in its terms; an offline parser for the redesigned detail page is verified, but full live ingestion is not restored. See shared/sourceAccess.ts and docs/feed-repairs-2026-10-05.md. Georgia's published page is parseable, but its explicitly dated results are old. Some CA/LA/RI and other records are intentionally withheld for conflicting anchors or ambiguous tiers. These records need source-specific reconciliation, not automatic scale/count edits.

The legacy optional tax/withholding scenario remains an approximation with configured rates, not verified tax liability. No tax-rate update was included. Retailer posted-winner counts do not establish current stock or better future odds.

## Run locally

From the repository's `web` folder:

```powershell
npm run dev -- --host 127.0.0.1
```

Use the localhost URL Vite prints. This does not run the collector or deploy anything. Tests: root `npm test` and `npm run typecheck`; web `npm test` and `npm run build`.
