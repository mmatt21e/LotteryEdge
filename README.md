# LotteryEdge

A personal, mobile-first tool that scrapes state lottery scratch-off prize data
and ranks games by **estimated expected value** — comparing prizes remaining
against tickets remaining to find the least-bad (occasionally +EV) games.

See [`PLAN.md`](./PLAN.md) for the original architecture notes and
[`docs/MULTI-STATE-PLAN.md`](./docs/MULTI-STATE-PLAN.md) for the multi-state
rollout research; both predate the current state and are kept as history.

## Status

- ✅ **EV math** — pure, unit-tested (`src/ev.ts`, `src/ev.test.ts`)
- ✅ **37 state scrapers** — 23 full-EV states (per-tier prizes remaining) and
  14 "lite" states (top-prize list only), one adapter per state in
  `src/sources/`, registered in `src/sources/registry.ts`
- ✅ **Mobile PWA** — installable React app with a searchable state picker, a
  cross-state combined ranking, per-game detail (odds, trends, simulator),
  budget helper, and a personal win/loss ledger (`web/`)
- ✅ **Automation** — daily GitHub Actions cron scrapes all states, commits
  data, and deploys the PWA to GitHub Pages (`.github/workflows/update.yml`)
- ✅ **Tests** — EV engine + parser fixture tests (`npm test`) and web unit
  tests (`cd web && npm test`), all run in CI
- 🚫 **Virginia** — its site blocks the automated (Playwright) scrape; listed
  as "not yet available" in the app until `scripts/va-scrape.mjs` lands data

## Repository layout

```
src/                 scraper CLI + EV engine (Node/TypeScript)
src/sources/         one adapter per state + shared http/parse helpers
data/                published JSON the PWA reads (committed by CI)
web/                 the PWA (Vite + React)
.github/workflows/   ci.yml (tests) + update.yml (scrape + deploy)
```

## The PWA (`web/`)

```bash
cd web
npm install
npm run dev       # local dev (copies ../data into public/data first)
npm run build     # production build -> web/dist
```

The app fetches `data/scratchers-<state>.json` from its own origin, so a fresh
scrape + redeploy is all it takes to update. It's installable (Add to Home
Screen) and caches the last data for offline viewing.

### Deploying (one-time)

1. Repo **Settings → Pages → Source = "GitHub Actions"**.
2. Merge to the default branch so the daily `schedule` activates (cron only runs
   from the default branch). Until then, run **Actions → "Update data & deploy"
   → Run workflow** manually.

## How it works

A browser PWA can't scrape a third-party site directly (CORS), so scraping runs
here (Node) on a schedule and publishes JSON that the future PWA will read.

```
scrape site HTML  ->  parse prize tiers  ->  compute EV/ROI  ->  data/scratchers-<state>.json
```

## Usage

```bash
npm install
npm test               # EV math + parser fixture tests
npm run scrape         # scrape every registered state ("all")
npm run scrape:nc      # scrape one state (any key from src/sources/registry.ts)
npm run scrape:va      # VA lite scrape (Playwright; currently blocked by the site)
npm run typecheck
```

Output is written to `data/scratchers-<state>.json` (games sorted by ROI,
descending), `data/history-<state>.json` (daily time-series for full states),
and `data/status.json` (per-run health report: ok/failed/stale per state).

## The EV estimate

For each game, from the published price, per-tier prize amount, odds, original
count, and remaining count:

1. `originalTickets` ≈ median over tiers of `odds × originalCount`
2. `fractionRemaining` ≈ `Σ remaining / Σ originalCount`
3. `ticketsRemaining` ≈ `originalTickets × fractionRemaining`
4. `remainingPrizeValue` = `Σ (amount × remaining)`
5. `evPerTicket` = `remainingPrizeValue / ticketsRemaining`
6. `roi` = `evPerTicket / price`  (above 1.0 = theoretical edge)

> ⚠️ `ticketsRemaining` is an **estimate** (states don't publish it directly).
> It's good for ranking, not a promise of profit. Real scratch-offs almost
> always sit below break-even.
