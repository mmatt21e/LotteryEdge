# Nebraska PDF importer in GitHub Actions

The former mobile prizes-remaining HTML endpoint returns 404. The adapter now reads the official report linked from the Nebraska Lottery website:

https://m.nelottery.com/images/media/Scratch_Prizes_Remaining.pdf

The report publishes top prize tiers only, so Nebraska remains a limited-data state. This importer does not calculate EV, complete prize ladders, or ticket inventory. Printed game numbers come from the PDF; unrelated internal website page IDs are not substituted.

## Runtime and validation

The existing scheduled updater installs Python **3.12.14** and **pdfplumber 0.11.9** before running the existing collector. The Python dependency is declared in `requirements-ne.txt`. `LOTTERYEDGE_PYTHON` can select an existing local Python executable; Actions uses `python` from setup-python's PATH. The adapter never installs software itself.

A separate **Nebraska PDF validation** workflow runs on relevant pull requests or manual dispatch with `contents: read`, no stored checkout credentials, and no Pages environment. It runs synthetic PDF/parser/date tests, fetches one official PDF, and checks that validation changed no repository files. It does not run the all-state collector, commit refreshed data, or deploy the PWA. Existing updater permissions and schedules are unchanged.

Local commands after installing the project and Python dependencies:

```sh
python -m unittest discover -s scripts -p test_ne_prizes.py -v
npm test
npm run typecheck
npm run validate:ne
```

`npm run validate:ne -- /path/to/report.pdf` validates an existing local report without a source request. Both validation modes only print a summary; in Actions, a short summary is also appended to the job summary. Raw PDFs and game records are not uploaded as artifacts.

## Dates and failure behavior

`generatedAt` remains the actual successful import time. Nebraska's explicit printed report date is stored separately in `sourceAsOf` and `resultsAsOf`, with `dateBasis: source` and `timeZone: America/Chicago`. If a future Nebraska source lacks an explicit date, the collector's date helper falls back to the previous local calendar day and labels it `assumed-previous-day`. September 2 at noon UTC therefore reports September 1; timezone and daylight-saving boundaries are covered by regression tests.

The current PDF parser requires the printed date. A missing date or changed layout fails closed rather than using that fallback to conceal a parser failure. Invalid/future dates fail before publication. A failed collection leaves the existing Nebraska snapshot and its dates unchanged. Historical winner dates are not involved.

The parser checks page geometry, both game columns, unique printed IDs, prices, prize/count alignment and the closing list. Tests use generated synthetic PDFs without redistributing lottery artwork. A saved official report dated October 4, 2026 was locally verified as 26 games, including Pocket Change 5X (#1335), which was absent from the redesigned HTML catalog.

This change only carries Nebraska metadata through the collector's existing lite-result interface. It does not import other local source corrections, freshness/EV policy changes, frontend changes or data snapshots. The subsequent audited quality release displays both import and reporting dates. The Nebraska compatibility helper now delegates to the shared reporting-date implementation.
