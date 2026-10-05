# Targeted feed repair — October 5, 2026

Historical local investigation of Nebraska, Arkansas, Connecticut and Oklahoma. The approved release now integrates these fixes; see release-2026-10-05.md for current deployment behavior.

| Feed | Finding and outcome |
|---|---|
| NE | Retired `/homeapp/scratch/prizesremaining/web` returns 404. Replaced with the linked official `https://m.nelottery.com/images/media/Scratch_Prizes_Remaining.pdf`. Parsed all 26 games; report explicitly says October 4, 2026. Imported October 5 at 15:54:28.275 UTC. Limited/top-prizes only; no complete-ladder EV. |
| AR | Existing official host returns Cloudflare HTTP 403 challenge, including the robots request; prior collection logs show the game list also blocked. Access pause occurs before any further adapter request. No bypass or host substitution. |
| CT | Old AJAX listing returns 404 after site redesign. `https://ctlottery.com/terms-and-conditions`, Prohibited User Conduct (f), explicitly prohibits automatic scraping. Collection paused before requests. New robots rules also disallow `/api/` and `/_next/`; no API extraction attempted. |
| OK | Old `/scratchers/get` JSON now returns the redesigned HTML site. New public detail format supports a checked offline parser. `https://oklottery.com/terms-conditions`, section II, requires written authorization for copying/reproduction. This is a conservative permission-review pause, distinct from CT's explicit scraping prohibition. No full live feed restoration is claimed. Robots disallows `/api/` and `/mobile/`; neither was crawled. |

The pauses are centralized in `shared/sourceAccess.ts`, used by collectors and frontend feed health. Remove a pause only after resolving its documented condition and verifying the source. A fresh-looking legacy snapshot cannot override the pause. Existing snapshot timestamps remain unchanged.

## Nebraska implementation and runtime

`src/sources/ne.ts` fetches one public PDF using the application's honest user-agent. `scripts/ne-prizes.py` reads bytes from stdin using pdfplumber 0.11.x, validates the one-page letter layout, explicit report date, two game columns, price/count rows, and unique printed IDs. Unrecognized layouts fail closed. The retired HTML parser remains for historical fixtures only.

The PDF lists printed game numbers, unlike the redesigned catalog's unrelated internal page IDs. Pocket Change 5X (#1335) appears in the PDF but not the catalog; it is retained. The separate closing page's 2030 placeholder does not cause 50X (#1357) to be marked closing. Only the report's closing list drives that flag for new PDF observations. Full prize ladders and original counts are absent; no EV is calculated.

Future NE collection needs Python with pdfplumber 0.11.x. This workstation's existing runtime was verified with pdfplumber 0.11.9; no dependency was installed or persistent environment setting changed. In the same PowerShell session as an explicitly intended NE collection:

```powershell
$env:LOTTERYEDGE_PYTHON = '<path-to-existing-python>'
```

Then run the existing collector with the single `ne` argument, not `all`. Its normal publication behavior writes current data and archives previous data. This repair instead added a versioned correction and immutable observation, leaving all preexisting root snapshots untouched. PR #9 configured Python 3.12.14/pdfplumber 0.11.9 in Actions. Its read-only Linux live validation passed with 26 games and the explicit October 4 report date.

The imported PDF's SHA-256 is `d4ce39c3b93d6bfc670af9b7dd3bcf318a840e19fa7f8030e8346b3579328b8f`. Original bytes, visual rendering, HTTP metadata, extracted rows and integration evidence are retained locally under the private local repair evidence directory.

## Evidence and date regression

- Root: 69 regression tests, including three no-network pause checks, two redesigned OK format checks and four NE observation/date checks. Root TypeScript check is separately required.
- Frontend: 48 tests, TypeScript project build and Vite/PWA build. Browser QA verified Nebraska's 26-game limited view with both dates, and Oklahoma's unavailable view with retained historical dates.
- Actual saved PDF parsed through the Node-to-Python adapter; all 26 reviewed records matched. Malformed PDF rejected. Saved OK game 842 detail parsed into 13 tiers with authoritative 725,040 printed tickets and zero quality-validation issues; this is offline format evidence, not current eligibility or a complete OK feed.
- Explicit regression: imported `2026-09-02T12:00:00Z`, Nebraska/America/Chicago, no official as-of => results `2026-09-01`, `assumed-previous-day`. Official dates take precedence. Failed attempts retain old dates. Winner dates were not altered.
- Existing snapshots, history, posted winners, status and ledger/favorite storage code remain protected by the original 71-file hash comparison. Exact source changes and original backups are in the sibling `lottery-repair-evidence` folder.

Remaining limitations: AR access, CT permission and OK permission/full-list discovery are unresolved. No bypass is authorized or implemented. Other states' stale data and previously rejected inconsistent prize/EV records remain honestly unavailable; this targeted repair does not assert all feeds are current.
