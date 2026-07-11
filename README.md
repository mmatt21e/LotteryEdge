# LotteryEdge

A personal, mobile-first tool that scrapes state lottery scratch-off prize data
and ranks games by **estimated expected value** — comparing prizes remaining
against tickets remaining to find the least-bad (occasionally +EV) games.

See [`PLAN.md`](./PLAN.md) for the full architecture and roadmap.

## Status (Phase 1)

- ✅ **EV math** — pure, unit-tested (`src/ev.ts`, `src/ev.test.ts`)
- ✅ **North Carolina scraper** — live, static HTML via Cheerio (`src/sources/nc.ts`)
- 🚧 **Virginia scraper** — scaffolded; needs the JSON XHR endpoint or a
  Playwright render (`src/sources/va.ts`)
- ⬜ **PWA frontend** — Phase 3

## How it works

A browser PWA can't scrape a third-party site directly (CORS), so scraping runs
here (Node) on a schedule and publishes JSON that the future PWA will read.

```
scrape site HTML  ->  parse prize tiers  ->  compute EV/ROI  ->  data/scratchers-<state>.json
```

## Usage

```bash
npm install
npm test              # run EV math tests
npm run scrape:nc     # scrape NC, write data/scratchers-nc.json, print top 5
npm run scrape:va     # (not implemented yet)
npm run typecheck
```

Output is written to `data/scratchers-<state>.json`, games sorted by ROI
(descending).

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
