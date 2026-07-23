# Software Improvement Plan

Produced by a read-only assessment on 2026-07-23 (branch `claude/document-instructions-5inn5q`,
HEAD `18a7ab5`). No source files were modified; this document is the only file created.
It is self-contained: a future agent can open the repository, read this plan and the
referenced files, and implement the approved tasks without any other context.

---

## 1. Executive Summary

**Overall project condition: good.** LotteryEdge is a working, two-part system — a
Node/TypeScript scraper covering 37 state lotteries that publishes JSON to `data/`, and a
mobile-first React/Vite PWA (`web/`) that ranks scratch-off games by estimated expected
value. The baseline is healthy: root typecheck passes, all 11 unit tests pass, the web app
typechecks and builds cleanly (including the PWA service worker), and a runtime smoke test
of the built app produced zero console errors.

**UI and usability condition: strong, with a few real defects.** The app has a coherent
visual language (CSS variables, dark/light themes, consistent cards/sheets/chips), honest
labeling of estimates and sample data, and good responsible-gambling framing. The main
problems are: one high-severity data-display bug (a state with no published data silently
shows the *previous* state's games under the new state's name — confirmed at runtime),
theme-blind hard-coded colors that hurt light-mode contrast and paint expected *losses*
green, missing keyboard/ARIA support on the app's core interactive elements, and leftover
North-Carolina-specific copy and tax math now that the app covers 37 states.

**Code quality and reliability condition: solid core, uneven edges.** The EV engine is
clean, documented, and well-tested. The weak points are: the scrape-and-deploy workflow can
silently fail to push fresh data; four adapters fetch with no timeout and can hang the
whole sequential nightly run; `main()` has an unhandled-rejection path; the Virginia
scraper silently produces nothing (its data file does not exist, yet Virginia is offered in
the app's picker); ~25 adapters re-implement the same small parsing helpers with subtly
different behavior; there are zero tests for any of the 39 parsers; and the 1,766-line
`web/src/App.tsx` concentrates ten components in one file. There is also dead code
(`src/sources/in.ts`, `src/sources/va.ts`, `scripts/va-discovery.mjs`,
`.github/workflows/discover-va.yml`) and two accidentally committed files (`game.html`, a
70 KB snapshot of an NC lottery page containing third-party analytics tokens, and `_s.mjs`,
a leftover debug script pointing at a machine-specific temp path).

**Improvements are recommended, not required.** Nothing is broken for the primary
NC-centric daily workflow. Priority 0 items are the wrong-state data display, the
silent push failure, and hang-prevention timeouts; everything else is quality, consistency,
and maintainability work that can proceed incrementally.

**Expected benefits:** correct data always attributed to the correct state; a nightly
pipeline that fails loudly instead of silently serving stale data; readable light-mode UI
with honest color semantics; keyboard/screen-reader access; adapters that are cheaper to
add and safer to change; and a test suite that catches parser breakage before deploy.

**Not evaluated:** live scraping of the 37 state sites (network-dependent; only committed
output was inspected), true phone install/notification behavior (checked via desktop
Chromium emulation), and multi-monitor/high-DPI desktop behavior beyond a 1280×900 check
(single-column layout makes this low-risk).

---

## 2. Improvement Objectives

- Create a clean and professional interface (largely achieved; close the gaps below).
- Make all screens visually consistent, in dark **and** light themes.
- Make normal workflows self-explanatory (state → ranked list → detail).
- Reduce unnecessary user steps.
- Prevent common user mistakes (never show one state's data under another state's name).
- Correct confirmed errors.
- Improve error handling and diagnostics (loud pipeline failures, visible partial data).
- Make code readable and manageable (split `App.tsx`, share adapter helpers).
- Simplify unnecessarily complex code; avoid new dependencies and abstractions.
- Preserve existing working behavior — every change below is scoped and incremental.

---

## 3. Project Overview

- **Purpose:** rank US lottery scratch-off games by estimated expected value ("net per $1")
  computed from each state's published prizes-remaining data, so the user can find the
  least-bad (occasionally +EV) games.
- **Intended users:** a single personal user on a phone (installable PWA); effectively
  "the owner and friends."
- **Primary workflows:**
  1. Open app → see current state's games ranked by value → tap a game → read detail
     (odds, tiers, trend, simulator) → optionally find a retailer.
  2. Switch state (or "All states combined") via the searchable picker.
  3. Track personal spend/wins in "My tickets"; favorite games; get change badges.
- **Technology stack:** TypeScript throughout. Scraper: Node 20+, `cheerio`, `tsx`,
  `vitest`; Playwright only for the VA script. Web: Vite 6, React 18, `vite-plugin-pwa`,
  hand-written CSS (`web/src/styles.css`), no UI framework.
- **Target runtime:** GitHub Actions (scrape, daily 11:00 UTC cron in
  `.github/workflows/update.yml`) + GitHub Pages (static PWA); browsers on mobile.
- **Major components:**
  - `src/ev.ts` — pure EV math (`estimateOriginalTickets`, `computeStats`); tested in
    `src/ev.test.ts`.
  - `src/sources/*.ts` — 39 per-state adapters; `src/sources/registry.ts` registers 37
    (23 "full", 14 "lite"); `src/sources/http.ts` — shared polite fetch.
  - `src/index.ts` — CLI orchestrator (`npm run scrape [key|all]`): sequential loop,
    per-state retry, sanity gate `assertSaneRois`, writes `data/scratchers-<st>.json`,
    `data/history-<st>.json` (via `src/history.ts`), `data/status.json`.
  - `web/src/App.tsx` — the entire UI (10 components); `useScratchers.ts` (data fetch),
    `analytics.ts` (derived stats), `states.ts` (state catalog), plus small modules
    (`storage.ts`, `changes.ts`, `demo.ts`, `format.ts`, `ux.ts`, `Sparkline.tsx`,
    `StatePicker.tsx`).
- **Entry points:** `src/index.ts` (CLI), `web/src/main.tsx` (app), `scripts/va-scrape.mjs`
  (Playwright VA path, currently failing silently).
- **Build & test commands:** root — `npm ci`, `npm test`, `npm run typecheck`,
  `npm run scrape <st|all>`; web — `npm ci`, `npm run dev`, `npm run build` (runs
  `scripts/copy-data.mjs` then `tsc -b && vite build`), `npx vite preview`.
- **Deployment:** `update.yml` scrapes, commits `data/`, builds `web/` with
  `VITE_BASE=/<repo>/`, deploys to GitHub Pages. `ci.yml` runs tests + typecheck + web
  build on push/PR.
- **Repository conventions:** no AGENTS.md/CLAUDE.md/CONTRIBUTING/EditorConfig. Strict TS
  (`strict`, `noUncheckedIndexedAccess`) in both packages. Data files pretty-printed;
  history minified. Comments explain "why"; keep that style.

---

## 4. Existing UI Inventory

All screens live in `web/src/App.tsx` unless noted. Verified at runtime (Vite preview +
Chromium, 390×844 mobile and 1280×900 desktop).

| UI ID | Screen or component | Purpose | Primary users | Current style | Main concerns |
|---|---|---|---|---|---|
| UI-001 | Home / "Best value" tab (`ValueTab`, `GameCard`) | Ranked game list with search, price chips, sort, filter toggles | Everyone | Clean cards, ROI bar + net/$1, confidence dot, sparkline | Raw-ROI sort promotes low-confidence outliers; hard-coded colors weak in light mode; cards not keyboard-accessible |
| UI-002 | "Hot sellers" tab (`SellersTab`) | Rank games by estimated tickets sold over a window | Frequent users | Ranked rows, window chips, custom date range | Fine; date inputs unlabeled for screen readers |
| UI-003 | "My tickets" tab (`MeTab`) | Personal spend/won ledger per state | Owner | KPI row + inline form + entry list | Ledger ID collision bug; free-text game name |
| UI-004 | All-states combined view (`AllStatesView`) | Cross-state ranked list, state filter chips | Power use | Same card list + banner | Duplicates ValueTab controls (drifted: no Budget button); failed states silently excluded; NC tax math applied to all states |
| UI-005 | Lite state view (`LiteView`) | Top-prize list for states without EV data | Everyone | Banner + simplified cards | Fine; honest about limits |
| UI-006 | Game detail sheet (`Detail`) | KPIs, trend, daily sales/prizes, tier tables, links | Everyone | Rich bottom sheet, well organized | Long; no focus trap/Escape; "printed vs now" odds needs its sub-caption (present) |
| UI-007 | Odds simulator (`Simulator`, inside detail) | What-if: remove winners/losers, watch odds move | Power use | Stepper rows + KPI grid | Good; number inputs small but usable |
| UI-008 | Budget helper sheet (`BudgetSheet`) | Best picks for a $ budget | Everyone | Sheet + list | Expected losses rendered in green (miscue); only reachable from single-state Value tab |
| UI-009 | Info sheet (`InfoSheet`) | Explain metrics, enable notifications, RG helpline | New users | Clear prose sections | Copy is NC-specific in places; notification wording implies push it can't do |
| UI-010 | State picker sheet (`StatePicker.tsx`) | Search + choose state / All / unavailable list | Everyone | Grouped rows with reasons | Virginia listed but has no data (see BUG-001/REL-001); no per-state freshness |
| UI-011 | Top bar | Brand, install, theme, info, refresh | Everyone | Icon buttons with aria-labels | Fine |
| UI-012 | Status/empty/error states | Loading, offline banner, "No data yet", demo banner | Everyone | Present and labeled | Error state unreachable when stale data exists (BUG-001) |

---

## 5. Proposed UI Design Standards

The existing hand-written CSS system is good. Codify it; don't replace it. All standards
below use the current custom-property scheme in `web/src/styles.css:1-37`.

- **Typography:** keep the system font stack (`styles.css:53`). Sizes: brand 20px/700;
  sheet titles 20–22px/700; card names 16px/700; body 14–15px; captions/labels 12px muted.
  No new fonts.
- **Color palette (semantic tokens):** keep `--bg --surface --surface-2 --text --muted
  --line --accent --green`. **Add** `--good`, `--ok`, `--warn`, `--bad` (the four ROI-band
  colors) and `--flat`, each with dark and light values, replacing the hard-coded hexes in
  `App.tsx` (`roiColor` at `web/src/App.tsx:386-391`, `CONF_COLOR` at 393-397, `dirColor`
  at 1470, and inline hexes at 1700, 1748). Light values must meet ≥ 4.5:1 contrast on
  `--surface` (current `#a3d977`/`#f5c451` on white fail).
- **Color semantics:** color encodes *value quality* (ROI band) on bars/badges; **negative
  dollar amounts are never green.** Expected-loss figures use `--text` or `--bad`; only a
  genuinely positive net may use `--good`.
- **Spacing:** 16px page gutter, 12–14px card padding, 8px gaps within rows, 10px between
  chips rows (as today — make uniform where it drifts).
- **Control sizes:** touch targets ≥ 40×40px (top-bar buttons already 40px); chips ≥ 32px
  high; inputs ≥ 40px high.
- **Button hierarchy:** primary = filled `--accent` (Add, Enable); secondary = outlined
  chip; destructive/none currently needed. Keep icon buttons round with `aria-label`.
- **Input layouts:** label text outside the field (as in "Spent $ / Won $"); every input
  must have an associated `<label>` (fix the Hot sellers date range and Budget input which
  already comply; ensure future ones do).
- **Dialog standard (bottom sheets):** all overlays use `.sheet-backdrop`/`.sheet` as
  today, plus: `role="dialog"` `aria-modal="true"`, Escape closes, focus moves into the
  sheet on open and returns to the opener on close. One shared `Sheet` component.
- **Data-grid standard:** the `.tiers`/`.daily` table pattern (right-aligned numbers,
  muted sub-headers, `gone` styling for exhausted tiers) is the standard; reuse it.
- **Status & error presentation:** `.status` for neutral/empty, `.status.error` for
  failures, `.demo-banner` for contextual notices, `.offline-banner` for connectivity.
  Every fetch failure must be visible when it affects what the user sees (see BUG-001).
- **Loading:** spinner on the refresh button + `.status` "Loading…" placeholder (as
  today). Keep skeletons out — list renders fast.
- **Empty states:** every list keeps an explanatory empty state ("No games match.",
  ledger call-to-action) — already good; preserve.
- **Navigation:** three tabs + state picker (as today). Tabs must be real `role="tab"`
  with `aria-selected` and arrow-key movement, or plain buttons without `role="tablist"`
  (either is acceptable; pick one — recommended: proper tabs).
- **Resizing/DPI:** single column, `max-width: 640px` centered (as today); verified fine
  at desktop width. `env(safe-area-inset-*)` already handled.
- **Accessibility expectations:** every interactive element focusable and keyboard
  operable; visible focus ring (`:focus-visible` outline in `--accent`); color never the
  only signal (badges carry text — keep); contrast per above.
- **Reusable controls:** `Chip`, `Kpi` (exist); add shared `Sheet` and `FilterControls`
  (see CODE-001/UI-D2) rather than duplicating.

---

## 6. Current Validation Results

Environment: Linux container, Node v22.22.2, npm 11.x. All commands run 2026-07-23.

| Validation | Exact command | Result | Relevant details |
|---|---|---|---|
| Root dependency install | `npm ci --no-audit --no-fund` | PASS | No errors |
| Root typecheck | `npx tsc --noEmit` | PASS | Exit 0, no output |
| Unit tests | `npx vitest run` | PASS | 1 file, 11/11 tests pass (`src/ev.test.ts`) |
| Web dependency install | `cd web && npm ci --no-audit --no-fund` | PASS | One upstream deprecation warning (`glob@11.1.0`, transitive) |
| Web typecheck + build | `cd web && npm run build` (= copy-data, `tsc -b && vite build`) | PASS | 38 modules, PWA `generateSW` OK, bundle 203 KB (63 KB gzip) |
| Runtime smoke test | `npx vite preview --port 4173` + Playwright (Chromium) script exercising home, detail, simulator, budget, tabs, picker, lite state, VA, all-states, themes, desktop | PASS with findings | Zero console errors/page errors. Screens render correctly. **Finding:** selecting Virginia leaves the previous state's data on screen (BUG-001) |
| Scrape (live) | not run | SKIPPED | Would hit 37 external sites from CI-like sandbox; out of scope for read-only assessment |
| Lint/format | n/a | NOT CONFIGURED | No ESLint/Prettier config exists in the repo |

No secrets were exposed; the repository has no secret configuration (the hard-coded API
tokens noted in SEC-001/REL-005 are third-party public-site tokens already in git).

---

## 7. Findings Summary

| ID | Finding | Category | Evidence | Severity | Confidence | Recommendation |
|---|---|---|---|---|---|---|
| BUG-001 | Failed state fetch shows previous state's games under new state's name | Confirmed defect | Runtime screenshot; `web/src/useScratchers.ts:49` keeps stale `data`; `App.tsx:171` shows error only when `!data` | High | Confirmed | Clear data on state change; always surface fetch errors |
| BUG-002 | Nightly workflow swallows git-push failure and deploys anyway | Confirmed defect | `.github/workflows/update.yml:70-74` retry loop ends in `sleep 5` (exit 0) | High | Confirmed | Fail the step when all retries fail |
| BUG-003 | `main()` never awaited/caught → unhandled rejection path | Confirmed defect | `src/index.ts:214` | Medium | Confirmed | `main().catch(...)` set exit code |
| BUG-004 | OH/OK/FL/MI adapters fetch with no timeout; one hang stalls the whole sequential run | Reliability risk | `oh.ts:53,66`, `ok.ts:72`, `fl.ts:111`, `mi.ts:94`; loop at `index.ts:163-171` | Medium | Confirmed | Use shared timeout fetch |
| BUG-005 | Change badges diff across states via single `"seen-nc"` localStorage key | Confirmed defect | `web/src/changes.ts:24` | Medium | Confirmed | Key snapshots per state |
| BUG-006 | "After tax" applies NC withholding to every state; label claims per-state | Confirmed defect | `web/src/analytics.ts:321-325`; `App.tsx:349-354` ("NC withholding"), `App.tsx:626-632` ("federal + state") | Medium | Confirmed | Honest labeling (federal + flat estimate) or per-state rates |
| BUG-007 | Ledger entry IDs can collide → deleting one entry deletes two | Confirmed defect | `web/src/storage.ts:43` id = `date-prev.length-name` | Low | Confirmed | Use a monotonic/unique id |
| BUG-008 | `num()` in FL/MI concatenates digits ("2 of 4" → 24), contradicting its doc | Confirmed defect (latent) | `fl.ts:39-45`, `mi.ts:78-83` | Low | Confirmed | Parse leading number; share helper |
| BUG-009 | MS/MO/LA/IN publish `price: NaN` (→ `null`) instead of dropping the game | Reliability risk (latent) | `ms.ts:101`, `mo.ts:91`, `la.ts:86`, `in.ts:85`; contrast `ca.ts:145` | Low | Confirmed | Uniformly drop bad-price games |
| REL-001 | Virginia scraper silently produces nothing; VA still offered in picker | Reliability risk | No `data/scratchers-va.json`; `update.yml:55-57` `continue-on-error: true`; `web/src/states.ts:57` lists VA | High | Confirmed | Surface VA failure; fix or move VA to "not yet available" |
| REL-002 | One bad game can void a whole state (`assertSaneRois`) while CI stays green below 34% failures | Reliability risk | `src/index.ts:18-29,56,153,204-211` | Medium | Confirmed | Keep gate; add visible reporting (status.json already lists `failed`/`stale`; alert on it) |
| REL-003 | No schema validation; silent partial degradation (e.g. MA odds feed `.catch(() => [])` loses every EV anchor) | Reliability risk | `ma.ts:167`; per-game `catch {}` skips in `ms.ts:121`, `mo.ts:111`, `la.ts:104`, `ar.ts:102`, `ct.ts:144`, `ca.ts:153` | Medium | High | Count and report dropped games/lost anchors per state |
| REL-004 | Hard-coded third-party API credentials/keys will rot silently | Reliability/Security | `oh.ts:25-26`, `nh.ts:33`, `or.ts:37-38` | Low | Confirmed | Centralize as named constants with source comments; RI-style runtime discovery where feasible |
| SEC-001 | Committed snapshot of NC lottery page with live third-party analytics token | Security (hygiene) | `game.html:88-100` (Exponea token); unreferenced anywhere | Low | Confirmed | Delete file |
| UX-001 | Raw-ROI sort puts low-confidence, ending outliers at the top of rankings | Usability | Runtime: All-states top card "+23.1¢/$1 · Low · ending"; sort at `App.tsx:292-299,542-549` | Medium | Confirmed | Sort penalty/segregation for low-confidence games, or default filter |
| UX-002 | Expected losses shown in green/positive colors (Budget sheet, cards at high ROI) | Usability | `BudgetSheet` uses `roiColor(roi)` for `expected −$2.56` (`App.tsx:1643-1646`); runtime screenshot | Medium | Confirmed | Never color negative $ green (design standard) |
| UI-D1 | ROI/confidence colors hard-coded for dark theme; poor light-mode contrast | UI inconsistency / Accessibility | `App.tsx:386-397,1470`; light theme vars `styles.css:14-37` unused by them | Medium | Confirmed | Move to CSS custom properties with light variants |
| UI-D2 | Filter/sort control block duplicated 3× and already drifted (All view lacks Budget) | UI inconsistency / Maintainability | `App.tsx:304-360` vs `569-635` vs `811-848` | Low | Confirmed | Extract one `FilterControls` component |
| A11Y-001 | Cards/sheets/tabs not keyboard-operable; no dialog semantics, focus trap, or Escape | Accessibility | `<li className="card" onClick>` `App.tsx:429`; `role="tablist"` without `role="tab"` `App.tsx:182-192`; sheets `App.tsx:923-925` | Medium | Confirmed | Buttons-in-cards or role/tabIndex/key handlers; shared accessible `Sheet` |
| UX-003 | NC-specific copy shown for all states ("NC doesn't publish claim deadlines", tax notes) | Usability | `App.tsx:1570-1573`, `App.tsx:349-354`, `analytics.ts:329-333` | Low | Confirmed | Generalize copy |
| UX-004 | All-states view silently drops failed/missing states; `failed` computed but unused | Usability | `useScratchers.ts:97-119` (`failed`), no UI reference | Low | Confirmed | One-line note "N states unavailable" |
| UX-005 | Data-health manifest (`data/status.json`) never surfaced in app | Optional enhancement | `src/index.ts:190-200` writes it; no fetch in `web/src` | Informational | Confirmed | Optional freshness note in picker |
| CODE-001 | `App.tsx` is 1,766 lines / 10 components | Maintainability | `web/src/App.tsx` | Medium | Confirmed | Split by screen; no logic changes |
| CODE-002 | ~25 adapters duplicate `num()`, odds parsing, `fmtDollars`, timeout-fetch, worker pool — with divergent behavior | Maintainability | e.g. `nc.ts:8`, `sc.ts:10`, `ar.ts:10`, `ct.ts:34`, `ca.ts:69` (re-implements `http.ts`), 13 lite `fmtDollars`, pools in `sc.ts:88`, `ca.ts:118`, `id.ts:114`, `ms.ts:109`, `mo.ts:99` | Medium | Confirmed | Add `src/sources/parse.ts` + `net.ts`; migrate opportunistically |
| CODE-003 | Dead code: `in.ts` (unregistered full adapter), `va.ts` (always throws), `va-discovery.mjs`, `discover-va.yml`, `game.html`, `_s.mjs` | Maintainability | `registry.ts` imports (no `in`/`va`); `va.ts:33-39`; `discover-va.yml:2-5` self-labels one-time; grep: `game.html` unreferenced | Low | Confirmed | Delete (decide IN's fate first — see §16) |
| CODE-004 | Some tuning constants lack rationale comments; per-state closing thresholds each invent their own cutoff | Maintainability | `index.ts:153` (`FAIL_JOB_THRESHOLD`), `ev.ts:27` (`MAX_PAYOUT`), `history.ts:36-37`, `ma.ts:38`, `ky.ts:18`, lite adapters | Low | Confirmed | Add rationale comments; align lite thresholds where sensible |
| CODE-005 | `.gitignore` gaps that admitted the accidental commits | Maintainability | `.gitignore:4` (`scratch-*.html` misses `game.html`), `.gitignore:18` (`_shot*.mjs` misses `_s.mjs`) | Low | Confirmed | Broaden patterns |
| TEST-001 | Zero tests for all 39 parsers; CI never exercises adapters | Testing gap | `ci.yml` runs only `npm test` (EV math) + typecheck + build | Medium | Confirmed | Fixture-based parser tests for top states |
| TEST-002 | No tests for web analytics (tax, velocity, simulator, budget) | Testing gap | `web/` has no test setup | Low | Confirmed | Add vitest to `web/` for `analytics.ts`/`format.ts` |
| PERF-001 | Daily Playwright download (~150 MB) uncached; `web/` npm deps uncached in CI | Performance (CI) | `update.yml:52`; `setup-node` lacks `cache-dependency-path` for `web/package-lock.json` (`update.yml`, `ci.yml:31`) | Low | Confirmed | Cache both |
| PERF-002 | Daily data commits grow git history unboundedly (~100–500 KB × 37 files/day) | Performance (repo) | `history.ts:36` caps file size, not git growth | Informational | High | Accept for now; note squash/branch options |
| DOC-001 | README/PLAN.md/package.json stale (say "NC & VA", "VA not implemented", 2-state layout) | Documentation gap | `README.md:9-18,58-66`, `package.json:6`, `PLAN.md:172-178` | Low | Confirmed | Refresh to match 37-state reality |

---

## 8. Detailed Findings

### BUG-001 — Wrong state's data displayed after a failed state switch
- **Classification:** Confirmed defect · **Severity:** High · **Confidence:** Confirmed (reproduced at runtime)
- **Evidence:** With NC loaded, choosing **Virginia** in the state picker renders header
  "Virginia · 81 games · updated Jul 23", "Find a retailer in Virginia", and NC's full game
  list ($2,000,000 Diamond Deluxe, etc.). Virginia has no data file (`data/` contains no
  `scratchers-va.json`), so the fetch fails — but the UI keeps showing NC's games labeled
  as Virginia.
- **Affected files/symbols:** `web/src/useScratchers.ts` — `useScratchers.load()`
  (lines 28–53); `web/src/App.tsx` — error rendering (lines 170–176).
- **Current behavior:** `load()` on error does
  `setS(prev => ({ ...prev, loading: false, error: … }))` (line 49), retaining `prev.data`
  from the previously selected state. `App` renders the error only when `error && !data`
  (line 171), so with stale `data` present, no error appears at all.
- **Desired behavior:** switching states never displays another state's games. A failed
  load shows the "No data yet for XX" status; a failed *refresh* of the same state may keep
  showing that same state's last data with a small "refresh failed" note.
- **Why it matters:** the app's one job is attributing prize data to the right state;
  this shows confidently wrong data (wrong games, wrong freshness stamp, wrong retailer
  link pairing) — worst on production Pages where any missing/failed state file reproduces it.
- **Recommended correction (simplest):** in `useScratchers`, reset data when the state key
  changes, and track which state the current data belongs to:
  ```ts
  // useScratchers.load(): on entry for a fresh state
  setS({ data: null, history: null, loading: true, error: null });
  // or keep prev.data ONLY when it belongs to the same state key
  ```
  Concretely: add `const forState = useRef(state)`; in the `useEffect` on `[load]`, when
  `state` differs from the loaded data's state, clear `data`/`history` before loading.
  Since `load` is rebuilt per `state` (useCallback dep), the minimal patch is: at the top
  of `load`, when `bust === 0`, use `setS({ data: null, history: null, loading: true,
  error: null })` instead of preserving `prev` — preserving stale data is only desirable
  for the *manual refresh* path (`bust !== 0`).
- **Alternatives considered:** keying the hook consumer with `key={stateKey}` in `App`
  (forces remount — heavier re-render, but also acceptable); verifying
  `data.state === stateKey` at render time (treats symptom, leaves stale history).
- **Compatibility/regression risks:** manual refresh must keep the current-state data on
  failure (preserved by the `bust !== 0` branch). Offline mode: the service worker's
  `NetworkFirst` cache still serves cached JSON, so offline behavior is unchanged.
- **Required tests:** manual — pick Virginia (no data): expect "No data yet for VA"
  status, not games; pick NC again: games load; airplane-mode refresh on NC keeps NC data.
- **Effort:** Small · **Required.**

### BUG-002 — update.yml swallows git-push failure
- **Classification:** Confirmed defect · **Severity:** High · **Confidence:** Confirmed
- **Evidence:** `.github/workflows/update.yml:70-74`:
  the retry loop `for i in 1 2 3; do git pull --rebase … && git push && break; echo …;
  sleep 5; done` — if all attempts fail, the loop exits after `sleep 5` (exit 0) and the
  step **succeeds**; the job then builds and deploys the PWA while the refreshed
  `data/*.json` never landed on the branch.
- **Affected files:** `.github/workflows/update.yml` (commit-and-push step).
- **Desired behavior:** push failure after retries fails the step (and job) loudly.
- **Recommended correction (simplest):** track success explicitly:
  ```bash
  ok=0
  for i in 1 2 3; do
    git pull --rebase origin "$GITHUB_REF_NAME" && git push && { ok=1; break; }
    echo "push attempt $i failed; retrying in 5s"; sleep 5
  done
  [ "$ok" = "1" ] || { echo "::error::git push failed after 3 attempts"; exit 1; }
  ```
- **Compatibility risks:** none — same behavior on success.
- **Required tests:** none automatable here; verify by inspection and next scheduled run.
- **Effort:** Small · **Required.**

### BUG-003 — `main()` unhandled rejection path
- **Classification:** Confirmed defect · **Severity:** Medium · **Confidence:** Confirmed
- **Evidence:** `src/index.ts:214` — bare `main();`. Failures outside `scrapeOne`'s
  try/catch (e.g. `mkdir` at line 160, `status.json` write at line 199) crash with an
  unhandled rejection instead of the controlled `process.exitCode = 1` path.
- **Recommended correction:** `main().catch((err) => { console.error(err);
  process.exitCode = 1; });`
- **Effort:** Small · **Required** (one line; protects the nightly job's error reporting).

### BUG-004 — Missing fetch timeouts in OH/OK/FL/MI adapters
- **Classification:** Reliability risk (confirmed inconsistency) · **Severity:** Medium · **Confidence:** Confirmed
- **Evidence:** raw `fetch(...)` with no `AbortController`: `src/sources/oh.ts:53,66`,
  `ok.ts:72`, `fl.ts:111`, `mi.ts:94`. Every other adapter uses a 30s abort (e.g.
  `http.ts`, `ca.ts:51`, `ma.ts:76`). The orchestrator runs states **sequentially**
  (`src/index.ts:163-171`) with no overall deadline, so one hung socket stalls the entire
  nightly run until the GitHub Actions 6-hour kill.
- **Desired behavior:** every network call has a bounded timeout.
- **Recommended correction:** reuse the existing timeout pattern (or the shared helper
  from CODE-002/T-11) in those four adapters; optionally add `timeout-minutes: 30` to the
  scrape job in `update.yml` as a backstop.
- **Required tests:** typecheck + one live scrape of each state (manual, post-approval).
- **Effort:** Small · **Required.**

### BUG-005 — Change badges diff across states (single `"seen-nc"` key)
- **Classification:** Confirmed defect · **Severity:** Medium · **Confidence:** Confirmed
- **Evidence:** `web/src/changes.ts:24` — `useLocalStorage<Snapshot>("seen-nc", …)` is
  keyed globally, not per state. Switching NC → TX overwrites NC's snapshot with TX's and
  diffs TX games against NC's snapshot (game-ID collisions across states produce bogus
  "top prize claimed"/"better value" badges; NC's own baseline is destroyed).
- **Affected symbols:** `useChanges` (`web/src/changes.ts`), caller `App.tsx:69`.
- **Recommended correction (simplest):** key by state —
  `useLocalStorage<Snapshot>(`seen-${stateKey}`, …)` with `stateKey` passed into
  `useChanges(games, generatedAt, stateKey)`. Old `"seen-nc"` entries are naturally
  orphaned (harmless) since NC's new key becomes `seen-nc` anyway — only non-NC states
  change keys.
- **Required tests:** switch NC → another full state → back; badges only reflect real
  same-state changes.
- **Effort:** Small · **Recommended.**

### BUG-006 — NC tax rates applied to every state
- **Classification:** Confirmed defect (accuracy) · **Severity:** Medium · **Confidence:** Confirmed
- **Evidence:** `web/src/analytics.ts:321-325` — `taxRate()` hard-codes NC's ~4.5% state
  withholding + 24% federal for all games. The All-states view's toggle tooltip claims
  "federal + state withholding" (`App.tsx:629`), and the single-state tooltip says
  "federal + NC withholding" (`App.tsx:351`) even when Texas (no state income tax) is
  selected. The detail note "after estimated federal + NC tax" (`App.tsx:956`) has the
  same problem.
- **Desired behavior:** either honest labeling ("federal 24% + ~4.5% flat state estimate")
  or per-state rates.
- **Recommended correction (simplest, no new data):** relabel everywhere to "flat
  estimate: 24% federal + 4.5% state (varies by state)" and centralize the strings.
  **Better (Small-Medium):** add `stateTaxRate: Record<string, number>` to
  `web/src/states.ts` (a dozen no-income-tax states are 0 — TX, FL, WA, NH, SD, TN, WY;
  others at their published lottery-withholding rate), thread the game's `state` into
  `taxRate(amount, state)`. `effectiveRoi` already receives the game (`analytics.ts:395`).
- **Compatibility risks:** the after-tax numbers change (become more accurate). No stored
  data affected.
- **Required tests:** unit test `taxRate` for a no-tax state (TX) and NC; visual check of
  the toggle labels.
- **Effort:** Small (relabel) / Medium (per-state) · **Recommended.**

### BUG-007 — Ledger ID collision deletes two entries at once
- **Classification:** Confirmed defect · **Severity:** Low · **Confidence:** Confirmed
- **Evidence:** `web/src/storage.ts:43` — `id: `${e.date}-${prev.length}-${e.gameName}``.
  Sequence: add game G twice on one day (ids `d-0-G`, `d-1-G`), delete the first, add G
  again → new id `d-1-G` duplicates the survivor; `remove()` (line 47) filters by id and
  deletes both.
- **Recommended correction:** monotonic counter persisted implicitly via timestamp:
  `id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`` (or
  `crypto.randomUUID()` — supported in all target browsers).
- **Effort:** Small · **Recommended.**

### BUG-008 — `num()` digit concatenation in FL/MI
- **Classification:** Confirmed defect (latent) · **Severity:** Low · **Confidence:** Confirmed
- **Evidence:** `src/sources/fl.ts:39-45` doc says `"  2 of 4 " -> leading numeric value`
  but `String(s).replace(/[^0-9.]/g, "")` yields `"24"`. Same in `mi.ts:78-83`. Harmless
  today (used only on single-number fields) but a trap — `ca.ts:99-103` had to
  special-case exactly this "X of Y" shape.
- **Recommended correction:** parse the leading number
  (`const m = String(s).match(/[\d,.]+/); …`) — ideally via the shared helper (T-11).
- **Effort:** Small · **Recommended.**

### BUG-009 — `price: NaN` published instead of dropping the game
- **Classification:** Reliability risk (latent inconsistency) · **Severity:** Low · **Confidence:** Confirmed
- **Evidence:** `ms.ts:101`, `mo.ts:91`, `la.ts:86`, `in.ts:85` keep games with
  `price: NaN` (serializes to `null`), while `ca.ts:145`, `id.ts:37`, `sc.ts:39`,
  `mi.ts:116`, `fl.ts:66`, `nh.ts:109` drop them. A null price flows into `computeStats`
  (`ev.ts:120`) yielding `roi: 0` — a silent garbage row. No committed file currently
  contains `"price": null` (verified), so latent.
- **Recommended correction:** uniformly **drop** games without a finite positive price,
  and count them in the per-state drop report (REL-003).
- **Effort:** Small · **Recommended.**

### REL-001 — Virginia: silent total failure, still offered in the UI
- **Classification:** Reliability risk · **Severity:** High · **Confidence:** Confirmed
- **Evidence:** the live VA path is `scripts/va-scrape.mjs` (Playwright) run with
  `continue-on-error: true` (`update.yml:55-57`). **No `data/scratchers-va.json` exists**
  in the repo, so the step has never succeeded (or never landed) — invisibly. Meanwhile
  `web/src/states.ts:57` lists Virginia as a lite state, so users can select it and hit
  BUG-001. `src/sources/va.ts` is an unregistered stub that always throws (`va.ts:33-39`).
- **Desired behavior:** VA either works and publishes, or is listed under "Not yet
  available" with a reason, and its CI failure is at least visible in the job log summary.
- **Recommended correction:** two independent steps:
  1. (UI, Small) Move VA from `STATES` to `UNAVAILABLE` in `web/src/states.ts` with
     reason "Site blocks automated access — working on it." until data actually exists.
     (BUG-001's fix also makes the failure honest, but "not yet available" is the truthful
     category.)
  2. (Pipeline, Small) In `update.yml`, make the VA step emit a visible warning
     (`echo "::warning::VA scrape failed"`) on failure instead of pure silence; keep
     `continue-on-error` so it never blocks other states. Diagnosing the actual VA
     blocker is a separate, unbounded investigation — out of scope here.
- **Effort:** Small · **Required** (the UI half; the pipeline half recommended).

### REL-002 — Whole-state data voided by one bad game; CI green under 34% failures
- **Classification:** Reliability risk (accepted tradeoff to document) · **Severity:** Medium · **Confidence:** Confirmed
- **Evidence:** `assertSaneRois` (`src/index.ts:18-29`, called at 56) throws for the
  entire state if any game's ROI > 5 or >10% of games exceed 3.0. Failed states keep
  last-good data indefinitely (`index.ts:124-128`) and the job only fails when
  `failed/total > 0.34` (`index.ts:153,204-211`). `data/status.json` already records
  `failed` and `stale` (12 states currently `stale`).
- **Desired behavior:** keep the conservative gate (publishing bogus +EV is worse than
  staleness) but make degradation *visible*.
- **Recommended correction:** print a per-run summary table (state, ok, changed, dropped
  games) to the job log; emit `::warning::` annotations for each failed/stale-N-days
  state. Optional: surface staleness in the app (UX-005).
- **Effort:** Small · **Recommended.**

### REL-003 — Silent partial degradation inside adapters
- **Classification:** Reliability risk · **Severity:** Medium · **Confidence:** High
- **Evidence:** `ma.ts:167` — the odds feed failure is swallowed (`.catch(() => [])`),
  silently zeroing every MA game's EV anchor (all `roi: 0`). Per-game detail-fetch
  failures are skipped uncounted in `ms.ts:121`, `mo.ts:111`, `la.ts:104`, `ar.ts:102`,
  `ct.ts:144`, `ca.ts:153`.
- **Recommended correction:** adapters return (or log) a `dropped` count; `scrapeOne`
  logs "MA: 99 games, 4 dropped, 99 missing anchors" style lines; a missing-anchor rate
  of 100% (the MA scenario) should fail that state rather than publish all-zero ROI.
- **Effort:** Medium (touches many adapters; can be incremental) · **Recommended.**

### REL-004 — Hard-coded third-party credentials
- **Classification:** Reliability/Security · **Severity:** Low · **Confidence:** Confirmed
- **Evidence:** `oh.ts:25-26` (`PUBLIC_USER`/`PUBLIC_PASS = "R7V5Sz8@"`), `nh.ts:33`
  (`GAME_DATA_API_KEY`), `or.ts:37-38` (scrambled client id/secret). These are the states'
  own public-frontend tokens (not user secrets) but will rot when rotated.
- **Recommended correction:** keep them (no secret manager needed for public tokens) but
  add a `// public frontend token, extracted from <url>; re-extract if 401` comment and,
  where cheap, adopt RI's runtime-discovery pattern (`ri.ts:40-49`). No action beyond
  documentation is required.
- **Effort:** Small · **Optional.**

### SEC-001 — `game.html`: committed snapshot with third-party token
- **Classification:** Security (hygiene) · **Severity:** Low · **Confidence:** Confirmed
- **Evidence:** `game.html` (1,457 lines) is a saved copy of NC's game-996 page:
  GTM (`game.html:77-81`), a live Exponea/Bloomreach token (`game.html:88-100`), jQuery
  CDN, frozen prize data. Unreferenced by any code, workflow, or doc (grep: zero matches).
  `_s.mjs` similarly is a 10-line Playwright screenshot script pointing at another
  session's `/tmp` scratchpad (`_s.mjs:2`) — both slipped past near-miss `.gitignore`
  patterns (`scratch-*.html`, `_shot*.mjs` — `.gitignore:4,18`).
- **Recommended correction:** `git rm game.html _s.mjs`; extend `.gitignore` (e.g.
  `*.snapshot.html`, `game.html`, `_s*.mjs`). If an NC fixture is wanted for parser tests
  (TEST-001), re-save a *stripped* fixture under `src/sources/__fixtures__/`.
- **Effort:** Small · **Required** (trivial, removes token + 70 KB noise).

### UX-001 — Raw-ROI ranking promotes the least-trustworthy games
- **Classification:** Usability · **Severity:** Medium · **Confidence:** Confirmed
- **Evidence:** runtime All-states view: #1 is "$50 500X Money Maker (MI) +23.1¢/$1 ·
  **Low** confidence · **ending**" — a nearly-sold-out outlier whose EV estimate the app
  itself flags as low-confidence, ranked above every high-confidence game. Sort code:
  `App.tsx:292-299` (`ValueTab`), `542-549` (`AllStatesView`) — pure
  `effectiveRoi` descending.
- **Current appearance/workflow:** the top of "Best value" is dominated by low-confidence
  spikes; the user must read the confidence dot to discount them.
- **Proposed appearance/workflow:** default sort stays "Best value / $1" but
  low-confidence games sort *after* medium/high at equal footing (stable tie-break), OR a
  "hide low-confidence" toggle chip defaulted **off** (visible but not forced). Recommended:
  sort key `(confidenceRank, effectiveRoi)` with a small caption "low-confidence estimates
  ranked last"; power users can still find them.
- **Controls to add/remove:** none added (behavioral change + one caption), or one chip.
- **How the user knows:** the existing confidence dot + a one-line caption under the sort
  select the first time the ordering demotes a game.
- **Compatibility risks:** ranking changes on purpose; document in the info sheet.
- **Required tests:** unit test for the comparator; manual check of both views.
- **Effort:** Small · **Recommended.**

### UX-002 — Expected losses rendered in green
- **Classification:** Usability (color semantics) · **Severity:** Medium · **Confidence:** Confirmed
- **Evidence:** Budget sheet (runtime): "expected **−$2.56**" in bright green
  (`App.tsx:1643-1646` uses `roiColor(roi)`, which is green for roi ≥ 0.9 —
  `App.tsx:386-391`). Same coloring on card net/$1 (−6.4¢ shown green, `App.tsx:462-467`).
  Green on a negative dollar figure reads as "winning."
- **Proposed:** color the *bar/band* by ROI quality (relative value), but color signed
  dollar/cent amounts by sign: negative → `--text` (neutral) or `--bad`; positive →
  `--good`. At minimum fix the Budget sheet's "expected −$X" and detail's "expected net"
  (`App.tsx:1105-1111,1137-1143`).
- **Effort:** Small · **Recommended.**

### UI-D1 — Theme-blind hard-coded colors
- **Classification:** UI inconsistency / Accessibility (contrast) · **Severity:** Medium · **Confidence:** Confirmed
- **Evidence:** `roiColor` (`App.tsx:386-391`) returns fixed hexes `#3ddc97 #a3d977
  #f5c451 #e08a5b`; `CONF_COLOR` (`393-397`), `dirColor` (`1470`), and inline hexes
  (`1700`, `1748`) likewise. These were tuned for the dark background; on the light theme
  (runtime screenshots) `#a3d977`/`#f5c451` text on white is well below 4.5:1.
- **Proposed:** define `--good --ok --warn --bad --flat` in `styles.css` for both themes
  (see §5); replace the JS hexes with `var(--good)` etc. (the functions can return the
  var strings — no structural change).
- **Files:** `web/src/styles.css`, `web/src/App.tsx`.
- **Effort:** Small · **Recommended.**

### UI-D2 — Triplicated filter/sort control block
- **Classification:** UI inconsistency / Maintainability · **Severity:** Low · **Confidence:** Confirmed
- **Evidence:** near-identical search + price chips + sort select + toggle chips in
  `ValueTab` (`App.tsx:304-360`), `AllStatesView` (`569-635`), `LiteView` (`811-848`).
  Already drifted: the Budget button exists only in `ValueTab`; tooltip texts differ
  (BUG-006).
- **Proposed:** one `FilterControls` component with props for which chips to show; part
  of the App split (CODE-001). Budget stays single-state-only by prop (its picks need one
  state's games — that's intentional, keep it).
- **Effort:** Medium (with CODE-001) · **Recommended.**

### A11Y-001 — Keyboard and screen-reader access
- **Classification:** Accessibility · **Severity:** Medium · **Confidence:** Confirmed
- **Evidence:**
  - Game cards are `<li … onClick>` (`App.tsx:429`) — not focusable, not activatable by
    keyboard; same for seller rows (`750-754`).
  - Tab bar sets `role="tablist"` (`App.tsx:182`) but children are plain buttons without
    `role="tab"`/`aria-selected`.
  - Sheets (`Detail`, `InfoSheet`, `BudgetSheet`, `StatePicker`) are plain divs
    (`App.tsx:923-925`): no `role="dialog"`, no `aria-modal`, no focus trap, no Escape
    handling, no focus return.
  - Positives to preserve: icon buttons have `aria-labels`; chips group has
    `role="group"` + label; badges carry text not just color.
- **Proposed (simplest adequate):**
  1. Shared `Sheet` component: `role="dialog" aria-modal="true"`, `useEffect` adding an
     Escape-key listener, focus the sheet container on mount (`tabIndex={-1}`), restore
     `document.activeElement` on unmount. Used by all four overlays.
  2. Cards: wrap the card content in a `<button className="card-btn">` (full-width,
     unstyled) or add `tabIndex={0} role="button" onKeyDown` Enter/Space. The button
     approach is preferred (native semantics, no key handling).
  3. Tabs: add `role="tab"` + `aria-selected` + `id`/`aria-controls`, arrow-key handler
     (10 lines), or drop `role="tablist"` and leave them as labeled buttons. Recommended:
     proper tabs.
  4. Add a global `:focus-visible { outline: 2px solid var(--accent); }` rule.
- **Files:** `web/src/App.tsx`, `web/src/StatePicker.tsx`, `web/src/styles.css`.
- **Regression risks:** click behavior unchanged; verify `e.stopPropagation()` on the
  inner star button still works inside a `<button>` wrapper (nested interactive elements —
  use a `<div role="button">` wrapper for the card if nesting a real `<button>` star
  inside a `<button>` card proves invalid; the star inside the card is the one nesting
  conflict to resolve, e.g. render the star as a sibling absolutely-positioned element).
- **Effort:** Medium · **Recommended.**

### UX-003 — NC-specific copy shown for all states
- **Classification:** Usability · **Severity:** Low · **Confidence:** Confirmed
- **Evidence:** InfoSheet: "NC doesn't publish claim deadlines for active games…"
  (`App.tsx:1568-1573`); ValueTab After-tax tooltip "federal + NC withholding"
  (`App.tsx:351`); detail tax note (`App.tsx:956`); `endingSoon` doc comment
  (`analytics.ts:328-332`).
- **Proposed:** state-neutral copy ("Most states don't publish claim deadlines…"), tax
  copy per BUG-006.
- **Effort:** Small · **Recommended** (bundle with BUG-006).

### UX-004 — All-states view: failed states silently excluded
- **Classification:** Usability · **Severity:** Low · **Confidence:** Confirmed
- **Evidence:** `useAllScratchers` collects `failed` (`useScratchers.ts:111-113`) but no
  UI consumes it; the banner (`App.tsx:563-567`) implies completeness.
- **Proposed:** extend the banner: "…from N states. M full states had no data today."
  (render only when `failed.length > 0`).
- **Effort:** Small · **Recommended.**

### UX-005 — Surface data health (status.json) in the app
- **Classification:** Optional enhancement · **Severity:** Informational
- **Evidence:** `data/status.json` (written by `src/index.ts:190-200`, copied into the
  app's `public/data/`) already carries per-state `ok`/`generatedAt`/`stale`; the app
  never fetches it.
- **Proposed (if wanted):** fetch once in `StatePicker` and show a subtle "updated Xh ago"
  or "stale" tag per state row.
- **Effort:** Medium · **Optional.**

### CODE-001 — Split `web/src/App.tsx` (1,766 lines)
- **Classification:** Maintainability · **Severity:** Medium · **Confidence:** Confirmed
- **Evidence:** ten components in one file: `App`, `ValueTab`, `GameCard`,
  `AllStatesView`, `SellersTab`, `LiteView`, `Detail`, `Simulator`, `Chip`/`Kpi`,
  `InfoSheet`, `BudgetSheet`, `MeTab`.
- **Proposed structure (mechanical move, zero logic change):**
  ```
  web/src/
    App.tsx            (~250 lines: state, routing between views)
    components/Sheet.tsx        (new shared accessible sheet — A11Y-001)
    components/FilterControls.tsx (UI-D2)
    components/GameCard.tsx
    components/primitives.tsx   (Chip, Kpi, roiColor→CSS vars)
    views/ValueTab.tsx
    views/AllStatesView.tsx
    views/SellersTab.tsx
    views/LiteView.tsx
    views/MeTab.tsx
    sheets/Detail.tsx (+ Simulator)
    sheets/InfoSheet.tsx
    sheets/BudgetSheet.tsx
  ```
  Keep `StatePicker.tsx` where it is. Do **not** restructure props or add context —
  current prop-drilling depth is 1–2 levels and fine.
- **Regression risks:** import cycles (avoid by keeping shared types in `types.ts`);
  otherwise a pure move verified by `tsc -b` and the runtime smoke script.
- **Effort:** Medium · **Recommended.**

### CODE-002 — Shared adapter helpers
- **Classification:** Maintainability · **Severity:** Medium · **Confidence:** Confirmed
- **Evidence (duplication with behavioral drift):**
  - money/number parser `num()` redefined in ~25 adapters with ≥4 variants
    (`nc.ts:8`, `sc.ts:10`, `ar.ts:10` regex-extract, `ct.ts:34`, `fl.ts:40` strip-all);
  - "1 in X" odds parser duplicated with different regexes in ≥12 adapters
    (`ms.ts:17`, `mi.ts:86`, `fl.ts:48`, `id.ts:75`, …);
  - `fmtDollars` identical in all 13 lite adapters (`vt.ts:48`, `co.ts:37`, …);
  - timeout-fetch wrapper copy-pasted in `ca.ts:69` (full re-implementation of
    `http.ts`), `ma.ts:76`, `nh.ts:52`, `nj.ts:60`, `mn.ts:76`, `or.ts:138`, `ri.ts:51`;
  - worker pool (`mapPool`/`mapLimit`) in `sc.ts:88`, `ca.ts:118`, `id.ts:114`,
    `ms.ts:109`, `mo.ts:99`; ad-hoc batches in `tx.ts:110`, `wv.ts:112`;
  - UA string literal hard-coded ~12×.
- **Proposed:** two small modules, no framework:
  - `src/sources/parse.ts`: `num(s)`, `leadingNum(s)` (fixes BUG-008), `parseOdds(s)`,
    `fmtDollars(n)`.
  - `src/sources/net.ts`: `fetchText(url, opts)`, `fetchJson(url, opts)` (30s abort,
    shared UA constant), `mapPool(items, n, fn)`.
  Migrate adapters **opportunistically** (when touched) plus a one-time sweep of the pure
  verbatim cases (lite `fmtDollars`, the seven fetch-wrapper copies, the five pools).
  Do not force-migrate adapters with genuinely source-specific parsing.
- **Regression risks:** each migrated adapter needs its output diffed against the
  committed `data/scratchers-<st>.json` (run scrape locally, compare game
  counts/prices/tiers) — this is the safety net; fixture tests (TEST-001) make it durable.
- **Effort:** Medium · **Recommended.**

### CODE-003 — Delete dead code
- **Classification:** Maintainability · **Severity:** Low · **Confidence:** Confirmed
- **Evidence:** `src/sources/in.ts` — complete Indiana full adapter, **not** imported by
  `registry.ts` (verified), no `data/scratchers-in.json`, and Indiana absent from
  `web/src/states.ts`; `src/sources/va.ts` — throws unconditionally (`va.ts:33-39`),
  unregistered; `scripts/va-discovery.mjs` + `.github/workflows/discover-va.yml` —
  self-described one-time discovery tooling ("Safe to delete once the VA scraper is
  built", `discover-va.yml:2-5`); `game.html`, `_s.mjs` (SEC-001).
- **Recommended:** delete `va.ts` (keep its "why VA is blocked" note as a comment in
  `scripts/va-scrape.mjs` or `docs/`), `va-discovery.mjs`, `discover-va.yml`, `game.html`,
  `_s.mjs`. For `in.ts` see §16 (Open decision: register it or delete it — do not leave
  it orphaned).
- **Effort:** Small · **Recommended.**

### CODE-004 — Document the tuning constants
- **Classification:** Maintainability · **Severity:** Low · **Confidence:** Confirmed
- **Evidence:** the main orchestrator/engine constants are already named and commented
  (`FAIL_JOB_THRESHOLD = 0.34`, `index.ts:153`; `MAX_PAYOUT = 0.95`, `ev.ts:27`;
  `MAX_POINTS`/`TIER_POINTS`, `history.ts:36-37`), but adapter-level thresholds are
  scattered and unexplained: `MIN_FRACTION_REMAINING = 0.05` (`ma.ts:38`),
  `MIN_REMAINING_POOL = 20_000` (`ky.ts:18`), and each lite adapter picks its own
  closing-soon cutoff with no shared rationale.
- **Recommended:** add a one-line rationale comment to each adapter threshold; align the
  lite closing-soon cutoffs where the sources are comparable. **No config file** — a
  personal tool doesn't need one.
- **Effort:** Small · **Optional.**

### CODE-005 — `.gitignore` hardening
- Covered under SEC-001. Add `game.html`, `_s*.mjs` (or broaden the existing intents:
  `*.snapshot.html`, `_s*.mjs`). **Effort:** Small · **Required with SEC-001.**

### TEST-001 — Parser fixture tests + CI coverage
- **Classification:** Testing gap · **Severity:** Medium · **Confidence:** Confirmed
- **Evidence:** `src/ev.test.ts` covers only EV math; zero of 39 adapters have tests;
  `ci.yml` never runs any scrape, so a parser that typechecks but returns 0 games passes
  CI and fails only in production.
- **Proposed (pragmatic, not exhaustive):**
  1. Refactor nothing: most adapters already export parse functions separate from fetch
     (e.g. `parseNc`). For the top 5–8 states by use (NC first, then the JSON-API states
     MA/CA/MI — cheap fixtures), save a **trimmed** HTML/JSON fixture under
     `src/sources/__fixtures__/` and assert: game count > 0, a known game's price/tiers
     parse exactly, no NaN prices, tier `remaining <= originalCount`.
  2. Add a generic invariant helper `assertValidGames(games)` (finite positive price,
     nonempty tiers for full states, remaining ≤ original) usable by every future test.
  3. CI (`ci.yml`) picks these up via the existing `npm test`.
- **Effort:** Medium · **Recommended.**

### TEST-002 — Web analytics tests
- **Classification:** Testing gap · **Severity:** Low · **Confidence:** Confirmed
- **Proposed:** add vitest to `web/` (devDependency + `"test": "vitest run"`), test
  `analytics.ts` pure functions: `effectiveRoi` (tax on/off), `simulateGame` (floors,
  winners ≤ tickets), `computeVelocity`, `profitOdds`/`liveProfitOdds`, `taxRate`
  (esp. after BUG-006), and `format.ts` edge cases. Wire into `ci.yml`.
- **Effort:** Small-Medium · **Recommended.**

### PERF-001 — CI caching
- **Classification:** Performance (CI cost) · **Severity:** Low · **Confidence:** Confirmed
- **Evidence:** `update.yml:52` reinstalls Playwright Chromium (~150 MB) daily;
  `setup-node` caches only the root lockfile — `web/npm ci` uncached in both workflows.
- **Proposed:** `actions/cache` on `~/.cache/ms-playwright` keyed by the Playwright
  version; `cache-dependency-path: | package-lock.json  web/package-lock.json` on
  setup-node.
- **Effort:** Small · **Optional.**

### PERF-002 — Git history growth from daily data commits
- **Classification:** Performance (repo size) · **Severity:** Informational · **Confidence:** High
- **Evidence:** every daily run rewrites ~37 `scratchers-*.json` + 22 `history-*.json`
  (100–500 KB each). Per-file size is bounded (`history.ts:36-37`) but git history is not.
- **Recommendation:** accept for now (free, versioned history is a feature per
  `PLAN.md:104`). If clone size becomes painful: move data commits to a dedicated
  `data` branch, or periodically squash. **No action now.**

### DOC-001 — Stale documentation
- **Classification:** Documentation gap · **Severity:** Low · **Confidence:** Confirmed
- **Evidence:** `README.md:12-18` ("North Carolina scraper — live… Virginia scraper —
  scaffolded"), `README.md:58-66` (usage mentions only nc/va; `scrape:va` "not implemented
  yet" while `scripts/va-scrape.mjs` exists), `package.json:6` ("Scrapes NC & VA…" — it
  covers 37 states), `PLAN.md:172-178` (progress note frozen at NC-only). `docs/MULTI-STATE-PLAN.md`
  tier tables also drifted from reality (VT shipped lite, not full; KS shipped lite).
- **Proposed:** refresh README status/usage to the 37-state registry-driven reality;
  one-line correction notes in the two plan docs (don't rewrite them — they're history).
- **Effort:** Small · **Recommended.**

---

## 9. Screen-by-Screen UI Plan

Only screens that change are listed. **Behavior that must remain unchanged everywhere:**
data fetching, EV math, filtering/sorting semantics (except UX-001's documented change),
favorites, ledger persistence, PWA install/offline behavior.

### UI-001 Home / Best value
- **Problems:** UX-001 (ranking), UX-002/UI-D1 (colors), A11Y-001 (cards, tabs).
- **Proposed layout:** unchanged. Changes are: confidence-aware default ordering with a
  one-line caption under the sort row; ROI colors from CSS vars; cards keyboard-focusable
  with visible focus ring; tab bar gets proper tab semantics.
- **Validation/status behavior:** unchanged ("No games match." empty state preserved).
- **Files:** `App.tsx` (or `views/ValueTab.tsx` after split), `styles.css`.
- **Manual verification:** tab through the page — every card, chip, tab reachable and
  activatable; light + dark themes; sort caption appears; low-confidence games sort last.
- **Acceptance criteria:** keyboard-only user can open a game's detail; ROI text ≥4.5:1
  contrast in both themes; no low-confidence game above a high-confidence one under
  default sort.

### UI-004 All-states view
- **Problems:** BUG-006 label, UX-004 (silent exclusions), UI-D2 (drifted controls).
- **Proposed:** banner gains "M states unavailable" suffix when applicable; controls come
  from shared `FilterControls`; tax tooltip honest.
- **Files:** `App.tsx`/`views/AllStatesView.tsx`, `useScratchers.ts` (expose `failed` —
  already does).
- **Acceptance criteria:** with a full state's file removed locally, banner reports it;
  controls visually identical to single-state view (minus Budget, which stays
  single-state).

### UI-006 Game detail sheet
- **Problems:** A11Y-001 (dialog semantics), UX-002 (expected-net colors), UX-003 (tax
  note copy).
- **Proposed:** rendered inside shared `Sheet`; Escape closes; focus managed; negative
  expected-net values not green.
- **Behavior preserved:** all KPIs, tables, simulator, share/favorite actions.
- **Acceptance criteria:** Escape closes; focus returns to the originating card; screen
  reader announces a dialog with the game's name.

### UI-008 Budget helper
- **Problems:** UX-002 (green losses).
- **Proposed:** "expected −$X" in neutral/`--bad`; "% return" may keep band color.
- **Acceptance criteria:** no negative dollar value rendered in `--good`.

### UI-009 Info sheet
- **Problems:** UX-003 (NC copy), BUG-006 (tax explanation).
- **Proposed:** state-neutral wording; short "After tax" section explaining the estimate
  basis; keep RG helpline block unchanged.

### UI-010 State picker
- **Problems:** REL-001 (Virginia listed with no data).
- **Proposed:** VA moves to "Not yet available" with reason until its data exists;
  (optional, UX-005) per-state freshness tags.
- **Acceptance criteria:** no selectable state can land on an empty dataset; every
  selectable full/lite state has a committed data file.

### UI-012 Status/error states
- **Problems:** BUG-001.
- **Proposed:** state switch clears prior data → loading → data or error; failed manual
  refresh keeps same-state data and shows a transient note.
- **Acceptance criteria:** at no point does the header/state label disagree with the
  games shown.

---

## 10. Prioritized Recommendations

### Priority 0 — Immediate (correctness/safety)
- BUG-001 wrong-state data display
- BUG-002 swallowed push failure
- BUG-003 unhandled `main()` rejection
- BUG-004 missing fetch timeouts (hang prevention)
- REL-001 (UI half): stop offering Virginia; make its CI failure visible
- SEC-001 + CODE-005: delete `game.html`/`_s.mjs`, harden `.gitignore`

### Priority 1 — Core quality
- BUG-005 per-state change snapshots
- BUG-006 + UX-003 honest tax handling and copy
- UI-D1 theme-aware semantic colors · UX-002 loss-color semantics
- A11Y-001 shared Sheet + keyboard access
- UX-001 confidence-aware ranking
- UX-004 all-states exclusion note
- TEST-001 parser fixture tests (NC + 2–3 JSON states) — the regression net for everything else
- REL-002/REL-003 visible degradation reporting

### Priority 2 — Valuable later
- CODE-001 App.tsx split (+ UI-D2 FilterControls) — do **before** further UI features
- CODE-002 shared adapter helpers (+ BUG-008, BUG-009 fixed in passing)
- CODE-003 dead-code deletion (after the §16 Indiana decision)
- TEST-002 web analytics tests
- DOC-001 documentation refresh
- BUG-007 ledger IDs

### Priority 3 — Optional
- CODE-004 named constants · REL-004 credential comments
- PERF-001 CI caching · UX-005 status.json surfacing
- PWA raster/maskable icons (currently a single SVG `purpose: "any maskable"` —
  `web/vite.config.ts:13-49`; cosmetic)

**Dependencies / order:** P0 first (independent of everything). In P1, do UI-D1 before
UX-002 (both touch `roiColor`); TEST-001 ideally before CODE-002 so helper migration has
a net. CODE-001 (split) should precede any further App.tsx work but *follow* the P1 UI
fixes to keep those diffs small and reviewable — or fold A11Y-001's `Sheet` extraction
into the split; either order is acceptable, pick one and note it.

---

## 11. Implementation Tasks

Every task is independently implementable and leaves the project buildable unless noted.
Standard validation for web tasks: `cd web && npm run build` + the manual step listed.
Standard validation for scraper tasks: `npm run typecheck && npm test`.

---

**T-01 · Fix wrong-state data display** — *BUG-001 · Small · Required*
- **Files:** `web/src/useScratchers.ts` (function `useScratchers`, `load`).
- **Do:** in `load`, distinguish initial/state-change loads (`bust === 0`) from manual
  refresh (`bust !== 0`). For `bust === 0`, start with
  `setS({ data: null, history: null, loading: true, error: null })`. For refresh, keep
  current behavior (preserve data, set error on failure). Optionally add
  `refreshError`-style note in `App` when `error && data` (small `.status` line).
- **Preserve:** manual-refresh resilience; offline cached serving.
- **Tests:** manual — select VA (before T-05) → "No data yet for VA" message, no NC games;
  NC → TX → NC transitions show correct games; refresh with network blocked keeps data.
- **Acceptance:** no render frame shows games from state A while the picker names state B.
- **Rollback:** revert the single function.

**T-02 · Fail the workflow when push fails** — *BUG-002 · Small · Required*
- **Files:** `.github/workflows/update.yml` (commit/push step).
- **Do:** apply the `ok=0 … exit 1` pattern from §8 BUG-002 verbatim.
- **Tests:** `bash -n` the script block; observe next scheduled run.
- **Acceptance:** a simulated failing push (e.g. temporary branch protection) fails the job.

**T-03 · Catch `main()`** — *BUG-003 · Small · Required*
- **Files:** `src/index.ts:214`.
- **Do:** `main().catch((err) => { console.error(err); process.exitCode = 1; });`
- **Acceptance:** typecheck passes; deliberate throw in `main` exits 1 without
  "unhandled rejection" banner.

**T-04 · Add fetch timeouts to OH/OK/FL/MI** — *BUG-004 · Small · Required*
- **Files:** `src/sources/oh.ts` (`getToken` line 53, `getJson` line 66), `ok.ts:72`,
  `fl.ts:111`, `mi.ts:94` (`gql`).
- **Do:** wrap each `fetch` with the AbortController-30s pattern already used in
  `ca.ts:51` (copy locally; T-11 later centralizes). Add `timeout-minutes: 45` to the
  update job.
- **Preserve:** headers/method bodies unchanged.
- **Tests:** `npm run typecheck`; optional live `npm run scrape oh` etc. post-approval.
- **Acceptance:** no adapter performs an unbounded network wait.

**T-05 · Virginia honesty** — *REL-001 · Small · Required (UI half)*
- **Files:** `web/src/states.ts` (remove `va` from `STATES`, add to `UNAVAILABLE` with
  reason "Site blocks automated scraping — no data yet."); keep `RETAILERS.va` (harmless).
  `.github/workflows/update.yml` VA step: append `|| echo "::warning::VA scrape failed"`
  (keep `continue-on-error`).
- **Preserve:** `scripts/va-scrape.mjs` untouched (future fix may revive it; then revert
  the states.ts move).
- **Acceptance:** VA appears greyed with a reason in the picker; picking it is impossible.

**T-06 · Remove accidental commits, harden .gitignore** — *SEC-001, CODE-005 · Small · Required*
- **Do:** `git rm game.html _s.mjs`; `.gitignore`: change `scratch-*.html` line to also
  cover `game.html` (add explicit `game.html` line), change `_shot*.mjs` to `_s*.mjs`.
- **Acceptance:** files gone; `git status` clean; `npm test` unaffected.

**T-07 · Per-state change snapshots** — *BUG-005 · Small*
- **Files:** `web/src/changes.ts` (`useChanges` signature + storage key), `App.tsx:69`.
- **Do:** `useChanges(games, generatedAt, stateKey)`; key = `` `seen-${stateKey}` ``.
- **Preserve:** freeze-for-session semantics (the `initial` ref) — note the ref captures
  the first state's snapshot; recompute it when `stateKey` changes (e.g. keep a
  `Map<stateKey, Snapshot>` in the ref, or simplest: `const initial =
  useRef<Record<string, Snapshot>>({}); if (!(stateKey in initial.current))
  initial.current[stateKey] = seen;`).
- **Tests:** manual per §8; add a tiny vitest if T-16 lands first.
- **Acceptance:** badges never reference another state's snapshot.

**T-08 · Honest taxes** — *BUG-006, UX-003 · Small–Medium*
- **Files:** `web/src/analytics.ts` (`taxRate`, `effectiveRoi`, `topPrizeAttempt`),
  `web/src/states.ts` (new `STATE_TAX: Record<string, number>`), `App.tsx` tooltip/note
  strings (lines 349–354, 626–632, 956, 1568–1573), `InfoSheet` copy.
- **Do:** `taxRate(amount, stateKey)`: federal 24% for ≥$5,000 (unchanged) + per-state
  withholding from `STATE_TAX` (0 for TX/FL/WA/NH/SD/TN/WY/CA*, NC 0.045 — populate from
  each lottery's published withholding; default 0.045 with a comment when unknown).
  Update all user-facing tax strings to "estimated federal + state withholding (varies by
  state)". Generalize the "NC doesn't publish claim deadlines" InfoSheet line.
- **Preserve:** `afterTax=false` path byte-identical.
- **Tests:** vitest (in T-16's web test setup) for TX=federal-only and NC; visual toggle
  check.
- **Acceptance:** no user-visible string claims NC math for a non-NC state.
- *CA note: California does not withhold state tax on lottery winnings — set 0.*

**T-09 · Semantic theme-aware colors** — *UI-D1, UX-002 · Small*
- **Files:** `web/src/styles.css` (define `--good --ok --warn --bad --flat` in `:root`,
  `[data-theme=light]`, and the `prefers-color-scheme` block), `web/src/App.tsx`
  (`roiColor` → returns `"var(--good)"` etc.; `CONF_COLOR`, `dirColor`, inline hexes at
  1700, 1748; Budget/detail expected-net sign-based color).
- **Suggested light values (≥4.5:1 on white):** good `#0e8a5f`, ok `#4d7c0f`, warn
  `#946300`, bad `#b4491f`, flat `#5a6683`. Dark values = current hexes.
- **Do also:** negative dollar/cent amounts never use `--good` (Budget sheet
  `App.tsx:1643-1646`, detail `1105-1111`, `1137-1143`, MeTab `1698-1701`, `1746-1750` —
  sign decides: negative → `--bad` or plain `--text`; positive → `--good`).
- **Acceptance:** axe/contrast spot-check of a card and the Budget sheet in light mode
  passes 4.5:1; no green negative dollars anywhere.

**T-10 · Accessible sheets, cards, tabs** — *A11Y-001 · Medium*
- **Files:** new `web/src/components/Sheet.tsx`; `App.tsx` (Detail, InfoSheet,
  BudgetSheet + GameCard, tabs), `StatePicker.tsx`, `styles.css` (`:focus-visible`).
- **Do:**
  1. `Sheet({ label, onClose, children })`: renders backdrop+sheet, `role="dialog"
     aria-modal aria-label={label}`, Escape listener, focus container on mount
     (`tabIndex={-1}`), restore previous focus on unmount. Replace the four inline
     backdrop/sheet blocks.
  2. Cards: make the card body a `div role="button" tabIndex={0}` with
     Enter/Space `onKeyDown` (avoids nesting the star `<button>` inside a button).
  3. Tabs: `role="tab"`, `aria-selected`, ArrowLeft/Right switching.
  4. Global `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`.
- **Preserve:** backdrop-click close, `stopPropagation` on sheet body and star.
- **Tests:** keyboard-only walkthrough (documented in §13).
- **Acceptance:** per §9 UI-001/UI-006 criteria.

**T-11 · Shared adapter helpers** — *CODE-002, BUG-008, BUG-009 · Medium*
- **Files:** new `src/sources/parse.ts`, `src/sources/net.ts`; migrate the verbatim
  cases: 13 lite `fmtDollars`, fetch wrappers in `ca.ts:69`, `ma.ts:76`, `nh.ts:52`,
  `nj.ts:60`, `mn.ts:76`, `or.ts:138`, `ri.ts:51`, pools in `sc/ca/id/ms/mo`, and the
  UA constant. Fix `fl.ts`/`mi.ts` `num()` via `leadingNum`. Make MS/MO/LA drop
  non-finite prices (match `ca.ts:145` behavior).
- **Signatures:**
  ```ts
  // parse.ts
  export const num = (s: string | null | undefined): number;        // strips $ , % space
  export const leadingNum = (s: string | null | undefined): number; // first number only
  export const parseOdds = (s: string): number | undefined;         // "1 in 4.13" | "1:4.13" -> 4.13
  export const fmtDollars = (n: number): string;
  // net.ts
  export const UA: string;
  export function fetchText(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<string>;
  export function fetchJson<T>(url: string, init?: …): Promise<T>;
  export function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]>;
  ```
- **Preserve:** each migrated adapter's output must match its committed
  `data/scratchers-<st>.json` structure (spot-diff after a local scrape, or rely on T-15
  fixtures where they exist). Migrate in ≥2 commits (lite sweep, then full states) so a
  regression bisects cleanly.
- **Acceptance:** typecheck+tests pass; no adapter defines its own `fmtDollars`/pool/
  timeout-fetch copy; `grep -r "LotteryEdge/0.1" src | wc -l` == 1.

**T-12 · Delete dead code** — *CODE-003 · Small · (after §16 decision on `in.ts`)*
- **Do:** delete `src/sources/va.ts`, `scripts/va-discovery.mjs`,
  `.github/workflows/discover-va.yml`; move `va.ts`'s "why blocked" note into a comment
  atop `scripts/va-scrape.mjs`. Indiana: either register (`registry.ts` + `states.ts` +
  verify live scrape) or delete `in.ts` — per user decision.
- **Acceptance:** typecheck passes; `update.yml` unaffected; no orphaned imports.

**T-13 · Visible degradation reporting** — *REL-002, REL-003 · Medium*
- **Files:** `src/index.ts` (`scrapeOne`, `main` summary), optionally adapters
  (return dropped counts — start with `ma.ts` anchor loss).
- **Do:** after the run, print a table (state | ok | games | changed | note) and emit
  `::warning::` for each failed state and each state stale ≥ 3 runs (`status.json`
  already tracks `stale`). In `ma.ts:167`, when the odds feed fails, `throw` (state-level
  retry/last-good keeps availability) instead of silently zeroing every anchor.
- **Preserve:** exit-code policy (fail > 34% or all).
- **Acceptance:** a forced single-state failure produces a job annotation, not silence.

**T-14 · Confidence-aware ranking + exclusion note** — *UX-001, UX-004 · Small*
- **Files:** `App.tsx` sort comparators (lines 292–299, 542–549), all-states banner
  (563–567).
- **Do:** for `sort === "roi"`, order by `(confRank, effectiveRoi)` where
  `confRank = {high:0, medium:0, low:1}` (medium ranks with high; only "low" demotes);
  caption under controls: "Low-confidence estimates are ranked last." Banner suffix when
  `all.failed.length > 0`: " · N full states had no data today."
- **Preserve:** all other sort keys; filters.
- **Acceptance:** per §9 UI-001; banner reflects induced failure.

**T-15 · Parser fixture tests** — *TEST-001 · Medium*
- **Files:** new `src/sources/__fixtures__/` (trimmed nc.html, ma-games.json +
  ma-odds.json, ca-list.json + one ca-detail, mi-graphql.json), new
  `src/sources/parsers.test.ts`, small exports where a parse function isn't exported yet.
- **Do:** per state: feed fixture → assert exact game count, one known game's
  price/tiers/odds, invariants (finite price > 0, remaining ≤ originalCount, tiers
  non-empty). Add shared `assertValidGames`.
- **Acceptance:** `npm test` covers ≥4 state parsers; CI runs them (already via
  `npm test` in `ci.yml:27`).

**T-16 · Web unit tests** — *TEST-002 · Small–Medium*
- **Files:** `web/package.json` (add `vitest` dev-dep + `"test"` script), new
  `web/src/analytics.test.ts`, `web/src/format.test.ts`; `.github/workflows/ci.yml` (add
  `npm test` in web job).
- **Do:** cover `effectiveRoi` (incl. T-08 taxes), `simulateGame` bounds,
  `computeVelocity`, `profitOdds`/`liveProfitOdds`/`liveTierOdds`, `centsPerDollar`,
  `relativeTime` ("just now" floor).
- **Acceptance:** `cd web && npm test` green in CI.

**T-17 · Split App.tsx** — *CODE-001, UI-D2 · Medium*
- **Files:** per the §8 CODE-001 layout; pure moves + the shared `FilterControls`
  (props: `{search, price+prices, sort, toggles: {fav, top, ending, afterTax, budget?},
  stateChips?}`).
- **Do:** mechanical extraction, no logic edits; `FilterControls` replaces the three
  copies (LiteView keeps its reduced prop set).
- **Preserve:** identical DOM/classNames (CSS untouched); identical behavior.
- **Tests:** `npm run build`; runtime smoke script (§13) unchanged results.
- **Acceptance:** `App.tsx` < 300 lines; no view file > 500 lines; UI pixel-identical
  (spot-compare screenshots).

**T-18 · Documentation refresh** — *DOC-001 · Small*
- **Files:** `README.md` (Status, Usage, layout sections), `package.json:6` description,
  one-line "superseded by reality — see README" notes atop stale sections of `PLAN.md`
  and `docs/MULTI-STATE-PLAN.md`.
- **Acceptance:** README names the registry as the source of truth (`npm run scrape
  <key|all>`), correct state counts, VA status honest.

**T-19 · Ledger IDs** — *BUG-007 · Small*
- **Files:** `web/src/storage.ts:41-45`.
- **Do:** `id: crypto.randomUUID()` (fallback `` `${Date.now()}-${Math.random()
  .toString(36).slice(2,8)}` `` if targeting very old WebViews).
- **Preserve:** existing stored entries (old ids remain valid).
- **Acceptance:** duplicate-scenario from §8 removes exactly one entry.

**T-20 · CI caching** — *PERF-001 · Small · Optional*
- **Files:** `update.yml`, `ci.yml`.
- **Do:** `setup-node` `cache-dependency-path` for both lockfiles; `actions/cache` for
  `~/.cache/ms-playwright` keyed on playwright version from `package-lock.json`.
- **Acceptance:** second consecutive run shows cache hits; runtime drops.

---

## 12. Implementation Batches

Each batch = one commit, leaves the tree buildable, ends with the listed validation.

**Batch 1 — Baseline & regression protection** · Tasks: T-15, T-16
Files: `src/sources/__fixtures__/*`, `parsers.test.ts`, `web` test setup, `ci.yml`.
Validate: `npm test && npm run typecheck`; `cd web && npm test && npm run build`.
Expected: all green; test counts increase (11 → ~30+).
Completion: CI runs both suites.
*(Rationale for deviating from "fixes first": the parser tests are the net for every
subsequent scraper change; they precede them safely because they change no behavior.)*

**Batch 2 — P0 correctness** · Tasks: T-01, T-02, T-03, T-04, T-05, T-06
Files: `useScratchers.ts`, `update.yml`, `src/index.ts`, `oh/ok/fl/mi.ts`,
`web/src/states.ts`, deletions + `.gitignore`.
Order: T-06 → T-03 → T-04 → T-02 → T-05 → T-01.
Validate: root + web builds/tests; manual VA/state-switch walkthrough (§13 items 1–4).
Expected: VA greyed-out; state switches always consistent.
Completion: all §8 P0 acceptance criteria met.

**Batch 3 — Shared UI standards (colors + a11y)** · Tasks: T-09, T-10
Files: `styles.css`, `App.tsx`, `StatePicker.tsx`, new `Sheet.tsx`.
Validate: `cd web && npm run build`; keyboard + contrast walkthrough (§13 items 8–10).
Expected: both themes readable; keyboard-complete.

**Batch 4 — Main workflow correctness** · Tasks: T-07, T-08, T-14
Files: `changes.ts`, `analytics.ts`, `states.ts`, `App.tsx`.
Validate: web tests (tax cases) + build; manual ranking/badge checks.
Expected: honest taxes, per-state badges, confidence-aware default sort.

**Batch 5 — Scraper reliability & hygiene** · Tasks: T-13, T-11, T-12, T-19
Files: `index.ts`, `parse.ts`/`net.ts` + adapters, deletions, `storage.ts`.
Order: T-13 → T-11 (lite sweep commit, then full-state commit) → T-12 → T-19.
Validate: `npm test && npm run typecheck` after each sub-step; optional local
`npm run scrape nc` diff against committed data.
Expected: fixtures still green (this is why Batch 1 came first).

**Batch 6 — Structure** · Tasks: T-17
Validate: web build + rerun the runtime smoke script; screenshot spot-compare.
Expected: pixel-identical UI.

**Batch 7 — Docs & polish** · Tasks: T-18, T-20 (+ optional CODE-004, REL-004 comments)
Validate: builds green; README accurate.

---

## 13. Regression Test Checklist

Run after each batch (items marked * need the preview server:
`cd web && npm run build && npx vite preview --port 4173`).

1. *Startup: app loads NC (default) with games, freshness stamp, no console errors.
2. *State switch: NC → Texas → NC; each shows its own games/counts; header never
   disagrees with list contents.
3. *Missing state: temporarily rename a state's JSON in `web/public/data` → picking it
   shows "No data yet", not stale games (BUG-001 guard).
4. *Lite state (Georgia): banner + top-prize cards render; official links work.
5. *All states: banner count matches loaded states; state chips filter; cards show state
   badges; (after T-14) exclusion note when a file is missing.
6. *Detail sheet: KPIs, trend, prizes-won table, both tier tables, simulator (+/−
   steppers clamp at 0/base), budget sheet math, share/favorite buttons.
7. *Tabs: Best value / Hot sellers (windows + custom range) / My tickets (add entry,
   totals update, delete exactly one entry).
8. *Keyboard: Tab reaches every card/chip/tab/button; Enter opens a card; Escape closes
   every sheet; focus returns to opener. (After T-10.)
9. *Themes: cycle auto → light → dark; ROI text, badges, banners legible in both; no
   green negative dollars. (After T-09.)
10. *Resize: 390px and 1280px widths — single column centered, no horizontal scroll.
11. Offline: with preview running, DevTools offline → banner appears; cached data still
    renders; refresh doesn't blank the current state.
12. PWA: `npm run build` emits `sw.js` + `manifest.webmanifest`; install prompt appears
    in Chromium (`beforeinstallprompt`).
13. Scraper: `npm test` (EV + parser fixtures) green; `npm run typecheck` green;
    optional live `npm run scrape nc` produces a valid file (spot-check a game).
14. Workflows: `update.yml` push step fails on simulated push failure (T-02); VA step
    warns visibly (T-05); `ci.yml` runs root tests, web tests, web build.
15. Existing data compatibility: committed `data/*.json` files load unchanged in the app
    (no schema change in any task above).
16. localStorage compatibility: pre-existing `favs`, `ledger`, `state`, `theme` keys
    still honored after upgrade (T-07 changes only `seen-*` keys; old `seen-nc` remains
    valid for NC).

---

## 14. Definition of Done

- Root and web builds pass with no new errors; all automated tests pass.
- No Critical/High finding (BUG-001, BUG-002, REL-001, SEC-001 group) remains open
  unless explicitly deferred by the user.
- §13 checklist fully green, including keyboard and both themes.
- All screens use the §5 standards (semantic color tokens, shared Sheet, focus rings).
- Success/warning/loading/empty/error states verified per §9 acceptance criteria.
- No duplicate user actions introduced (refresh button still disables while loading;
  simulator/ledger actions idempotent).
- Diffs are scoped per batch; no unrelated reformatting; comment style preserved.
- No new dependencies beyond `vitest` in `web/` (T-16); no new abstractions beyond
  `Sheet`, `FilterControls`, `parse.ts`, `net.ts`.
- Existing intended behavior (EV math, data schema, PWA/offline, favorites, ledger data)
  unchanged.
- This document updated with per-task status and any deviations.

---

## 15. Deferred and Rejected Ideas

- **Rewrite UI with a component framework / Tailwind / Recharts** (PLAN.md §4 mentions
  Tailwind+Recharts; the app shipped with hand CSS + hand SVG) — rejected: dependency
  cost, no user value; current CSS system is small and coherent.
- **Virtualized lists for the 1,567-game all-states view** — rejected (lack of evidence):
  the `ALL_RENDER_CAP = 400` slice (`App.tsx:492`) already bounds DOM size and scrolling
  is smooth; revisit only with measured jank.
- **Central state management (context/redux/zustand)** — rejected: prop depth is 1–2;
  unnecessary complexity.
- **Config file / env system for scraper constants** — rejected: personal tool, named
  in-code constants suffice (CODE-004).
- **Schema-validation library (zod etc.) for adapter payloads** — rejected: dependency
  cost; the `assertValidGames` invariant helper + fixtures give most of the benefit.
- **Automatic deletion of stale state data files** — rejected: last-good data is a
  feature (availability); visibility (T-13) is the fix, not deletion.
- **Parallelizing the state scrape loop** — deferred: politeness and simplicity favor
  sequential; timeouts (T-04) remove the hang risk. Revisit if runtime becomes a problem.
- **Moving daily data commits to a separate branch / LFS** (PERF-002) — deferred until
  clone size actually hurts; squashing history is destructive and not worth it now.
- **True push notifications for favorites** — rejected: requires a push server;
  the current in-app `Notification` on open is honest and free. (InfoSheet copy already
  explains the limitation — keep it accurate.)
- **Fixing VA scraping itself** — deferred as an open-ended investigation (bot
  detection); T-05 makes the absence honest, which is the user-facing fix.
- **Per-tier "now" odds column removal** (some users may find printed-vs-now confusing) —
  rejected: it's explained in the caption and InfoSheet; keep.

---

## 16. Assumptions and Open Decisions

**Assumptions**
1. The tool remains personal (single user, no auth/backends). All recommendations assume
   this scale.
2. Committed `data/*.json` reflects real current scraper behavior (used as ground truth
   for helper migrations).
3. GitHub Pages remains the deploy target; `VITE_BASE` mechanism stays.
4. The `18a7ab5` working tree (clean at assessment time) is the implementation baseline.

**Open decisions (implementation may proceed without them except D1)**

| # | Decision | Options | Recommended default | Effect of alternative |
|---|---|---|---|---|
| D1 | Indiana adapter (`src/sources/in.ts`) | (a) register + add to web catalog after verifying a live scrape; (b) delete | **(b) delete** — it was never registered, never published data, and its live correctness is unverified; resurrect from git if wanted | (a) adds a 24th full state but requires a live-scrape verification pass first; blocks T-12 until decided |
| D2 | Tax handling depth | (a) relabel as flat estimate; (b) per-state rate table | **(b)** — small table, materially more honest | (a) is 15 minutes and acceptable if (b)'s rate research is unwanted |
| D3 | Low-confidence ranking treatment | (a) demote in default sort; (b) opt-in hide toggle; (c) leave as-is with stronger badge | **(a)** | (b) preserves current ordering; (c) weakest fix |
| D4 | App.tsx split timing | (a) after P1 UI fixes (Batch 6 as planned); (b) before them | **(a)** — keeps fix diffs reviewable | (b) makes later diffs smaller but delays user-facing fixes |
| D5 | VA long-term | (a) leave greyed out; (b) invest in defeating bot detection | **(a)** for now | (b) is unbounded effort |

---

## 17. Codex Execution Instructions

1. Read this plan in full, plus `README.md`, `PLAN.md`, `docs/MULTI-STATE-PLAN.md`.
   There are no AGENTS.md/CLAUDE.md/CONTRIBUTING files.
2. Check `git status`; preserve any uncommitted user changes. Work from the branch the
   user designates.
3. Revalidate the §6 baseline (root: `npm ci && npm test && npx tsc --noEmit`; web:
   `npm ci && npm run build`). If anything fails that passed here, stop and report.
4. Implement **only the task IDs the user approves**, in the §12 batch order (Batch 1
   first unless the user directs otherwise).
5. Keep each change narrowly scoped to its task's listed files; no drive-by
   reformatting; match existing code style (comments explain "why").
6. Preserve existing intended functionality — the §13 checklist defines "unchanged."
7. Use the §5 UI standards for any visual change; do not introduce other design tokens.
8. Prefer simple implementations with the existing stack; the only sanctioned new
   dependency is `vitest` in `web/` (T-16); the only sanctioned new abstractions are
   `Sheet`, `FilterControls`, `src/sources/parse.ts`, `src/sources/net.ts`.
9. Run the batch's validation commands after each batch; run the relevant §13 items.
10. For scraper-touching tasks, verify adapter output against committed `data/` files
    (or the fixtures once Batch 1 lands) before considering the task done.
11. Update this document as you go: mark task status (done/deviated/blocked) inline in
    §11 and note deviations at the top of §12.
12. If repository conditions contradict this plan (files moved, behavior differs from
    the documented evidence), stop and ask the user before improvising.
13. Do not commit, push, or open a pull request unless the user separately requests it;
    when requested, one commit per batch with a message naming the batch and task IDs.
14. Do not begin any implementation until the user has explicitly selected which
    findings/tasks to implement.
