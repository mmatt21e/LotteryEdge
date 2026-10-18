# Feed-health reporting correction (local, October 18, 2026)

The October 17 refresh collected 50 Iowa and 75 Rhode Island records but rejected all of them. Both feeds still reported successful collection and a recent assumed date. Idaho had five unchanged comparisons while its assumed date advanced with each import. This change separates collection completion, usable coverage and date/content observations without changing EV validation or source permissions.

## Behavior

- Full snapshots and state status entries carry `coverage`: `sourceRecordCount`, `validatedCount`, `excludedCount`, and `validation` (`usable`, `partial`, `all-excluded`, or `empty`). Lite coverage describes available listings, not supported EV. `gameCount` keeps its prior meaning for compatibility.
- `ok` and `okCount` remain collection-completion indicators. New summary counts are `collectedCount`, `usableCount` and `zeroUsableCount`. Usable records may still be stale; the summary explicitly says dates are checked separately. All-excluded feeds produce explicit warnings and no longer increment the legacy unchanged-estimate counter.
- Full collection with an unexpectedly empty raw array records its observation, fails and retains the previous published snapshot. A nonempty all-excluded array remains archived and publishes its exclusions with zero estimates; unsupported historical EV is never resurrected as a fallback. Existing snapshot/history archives remain intact.
- A SHA-256 hash of the complete parsed records, independent of object/game/tier ordering, tracks identical observations. Duplicate rows are preserved. `contentObservedSince` records the start of the observed identical-content sequence, not the provider's last update. `unchangedRuns` counts consecutive comparisons, so six equal observations give five. A new hash resets the sequence. No older raw observations are rewritten or silently backfilled.
- At three unchanged comparisons the UI warns about unchanged content. Legacy `staleRuns` remains usable with a clearly labeled warning about unchanged **validated ticket estimates**, not a claim that raw source content was compared. During the initial hash rollout, that legacy warning can remain until sufficient raw comparisons exist.
- The frontend derives coverage from the records and exclusions and re-runs the existing validators, rather than trusting metadata to bypass them. Stale-but-valid records remain distinct from validation failures. Zero usable records show “Current comparison unavailable”; recent assumed dates show “Recent import; results date assumed.” Idaho's legacy evidence shows “Data unchanged; provider freshness unconfirmed.” The header counts source records, including excluded ones.
- Unchanged observations alone do not suppress otherwise valid estimates or fabricate an official as-of date. October 11 official dates for Nebraska and Georgia remain stale in the October 18 regression, while their historical lite facts remain accessible.

No adapters, EV formula/validator bodies, restricted-source guards, workflow schedule, ledger/favorite storage, historical data files or dependency versions are changed. No provider collection, production run, push, merge or deployment was performed for this local correction.

## Deterministic validation

- 89 root tests and 60 frontend tests pass (149 total). Added coverage includes empty versus all-excluded feeds, same-value RI rows, partial validation, six identical Idaho observations, input preservation, unchanged-date warnings, NE/GA official dates, and paused-source protection.
- An integration regression runs the real collector orchestration with an in-memory filesystem and synthetic adapters. It verifies exact prior snapshot/history archival, preservation of prior output on an empty source response, and zero calls to paused adapters or fetch. It never writes original data files.
- A server-rendered component regression checks the actual unavailable/coverage/exclusion wording. Root TypeScript and web TypeScript/Vite/PWA build pass.
- Offline replay of all 37 previously captured public snapshots preserves accepted game IDs and computed EV objects exactly, leaves input snapshots untouched, and exposes no invalid EV. IA/RI become unavailable on health status; Idaho gets the warning; NE/GA stay stale.
- Existing installed dependency files were copied into this isolated worktree only after lockfile text equivalence checks. No package acquisition or version change occurred. Local validation used Node 24; GitHub's Node 20 CI has not run on this unpublished change. No interactive browser acceptance or new service-worker test was performed.

## Local review and rollback

Base revision: `60ceebd5b62425704711be4c806ae3cccd042b19`. Work is isolated on `codex/feed-health-20261018`; the dirty canonical checkout is unchanged. Inspect the local branch diff and test evidence before authorizing any publication.

No production/data rollback is needed because nothing was published and source data was not edited. To undo the code later, revert the local fix commit on its isolated branch (a normal additive Git revert); do not reset, clean, delete or pull over the canonical dirty checkout. The local audit evidence includes the exact changed-path SHA-256 manifest, full patch and preserved new-file contents. Keeping this branch and returning to the published base in a separate worktree also leaves the live app unaffected.

Source-specific IA lite promotion, RI tier/anchor reconciliation, Idaho's missing-count provenance and any policy to suppress unchanged-but-valid rankings remain separate follow-ups. Current access pauses stay in force.
