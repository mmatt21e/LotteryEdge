# LotteryEdge — Build Plan

A mobile-first Progressive Web App (PWA) that scrapes an official lottery
website, calculates statistics, and surfaces the best-value plays. Built as a
**personal tool** (single user, your phone).

---

## 1. What the app actually does

Two analysis features, in priority order:

1. **Scratch-off edge finder (primary).** For each active instant/scratch-off
   game, compare **prizes remaining** against **tickets remaining** to estimate
   the current expected value (EV) per ticket, then rank all games by EV so you
   can see which games are currently "worth" playing.
2. **Jackpot / draw-game trends (secondary).** Track jackpot size over time,
   rollover streaks, and prize-tier history for the draw games (Powerball,
   Mega Millions, state games, etc.).

The whole point of #1 is that a fresh scratch-off game and a nearly-sold-out
game with its top prizes already claimed have very different real odds — and
the state publishes the numbers needed to tell them apart.

---

## 2. The one architectural fact that shapes everything

**A browser PWA cannot scrape a third-party website directly.** When your phone
loads the app and tries to `fetch()` the lottery site's HTML, the browser blocks
it (CORS / same-origin policy). This is not something you can code around from
the client.

So the design splits in two:

```
  ┌─────────────────────┐        ┌──────────────────────┐        ┌─────────────┐
  │  Scheduled scraper   │  reads │   Official lottery    │        │   The PWA    │
  │  (runs in the cloud, │◄───────│   website (HTML)      │        │  (your phone)│
  │   NOT on your phone) │        └──────────────────────┘        └──────┬──────┘
  │                      │                                                │
  │  parse → compute EV  │                                                │
  │  → write data.json   │────────────────────────────────────────►  fetch data.json
  └─────────────────────┘        (published JSON, same origin/CDN)   render + rank
```

- The **scraper** runs on a schedule in the cloud, does the scraping + math, and
  publishes a small JSON file.
- The **PWA** is a static site that just reads that JSON and draws the UI. No
  scraping happens on the phone.

### About "real-time"
Scratch-off *prizes-remaining* pages update roughly **daily** (sometimes
weekly), not by the second. So "real-time" for this data means:
- a **scheduled scrape** (e.g. once or a few times a day), plus
- a **manual "Refresh" button** in the app that triggers a fresh scrape on demand.

That is cheaper, more reliable, and kinder to the source site than constant
polling — and you lose nothing because the underlying data barely moves.

---

## 3. The core math (scratch-off EV)

The official game pages typically publish, per game:
- Ticket **price**
- Each **prize tier**: prize amount, original number of prizes, **prizes remaining**
- Overall **odds** ("1 in X") and/or per-tier odds

From that, per game:

1. **Original total tickets** — for any tier: `original_prizes × tier_odds`.
   (Consistent across tiers; use the most reliable published figure.)
2. **Fraction of pool remaining** — approximate that prizes are won in
   proportion to tickets sold, so
   `fraction_remaining ≈ total_prizes_remaining / total_original_prizes`.
3. **Estimated tickets remaining** — `original_total_tickets × fraction_remaining`.
4. **Remaining prize value** — `Σ (prize_amount × prizes_remaining)` across tiers.
5. **Expected value per ticket** — `remaining_prize_value / tickets_remaining`.
6. **Edge / ROI** — `EV_per_ticket / ticket_price`. Above ~1.0 is unusually good
   (note: real lotteries are almost always below 1.0 — this finds the *least bad*
   and occasionally genuinely +EV games, e.g. second-chance/top-prize-heavy ones).

> ⚠️ Estimation caveat: states rarely publish "tickets remaining" directly, so
> step 3 is an estimate. It's the standard method used by scratch-off analytics
> sites and is good enough for ranking. Show it as an estimate, not gospel.

Extra signals worth computing and displaying:
- **Top prizes remaining** (raw count) — headline number people care about.
- **% of top prizes still unclaimed** vs **% of tickets estimated sold**.
- **EV trend** over time (needs history — see storage below).

---

## 4. Recommended stack (cheap, personal, low-maintenance)

| Piece | Choice | Why |
|---|---|---|
| PWA frontend | **Vite + React + TypeScript** + `vite-plugin-pwa` | Fast, installable, offline-capable with almost no config |
| UI / mobile | **Tailwind CSS**, big touch targets, single-column | Mobile-first, quick to style |
| Charts | **Recharts** (or `lightweight-charts` for trends) | Simple, good enough for EV/jackpot trends |
| Scraper | **Node + TypeScript**, `fetch` + **Cheerio** (HTML), or **Playwright** if the page renders data via JavaScript | Cheerio is fast for static HTML; Playwright handles JS-heavy pages |
| Scheduler / runtime | **GitHub Actions cron** (free) | No server to run or pay for; runs the scraper on a schedule |
| Data storage | **JSON committed to the repo** (`/data/*.json`) | Free, versioned (free history for EV trends!), trivial for the PWA to fetch |
| Hosting | **Cloudflare Pages / Vercel / GitHub Pages** (free tier) | Static PWA hosting, HTTPS included (required for PWA install) |
| On-demand refresh | GitHub Actions **`workflow_dispatch`** triggered from the app (or just re-run manually) | Lets the "Refresh" button kick a fresh scrape |

**Why this shape for a personal tool:** zero servers to maintain, $0 hosting,
and committing the JSON to git gives you free historical data to chart trends
over time — no database needed. If you later want many users, swap the JSON file
for Supabase/Cloudflare KV and add caching + rate limiting.

If the target pages are JavaScript-rendered (data appears only after scripts
run), switch the scraper from Cheerio to Playwright — Chromium is already
available in CI.

---

## 5. Data model (the JSON the scraper publishes)

```jsonc
// /data/scratchers.json
{
  "generatedAt": "2026-07-11T14:00:00Z",
  "state": "XX",
  "games": [
    {
      "gameId": "1234",
      "name": "$5,000,000 Cash Blowout",
      "price": 30,
      "overallOdds": 2.51,
      "startDate": "2025-11-01",
      "tiers": [
        { "amount": 5000000, "originalCount": 6,   "remaining": 3 },
        { "amount": 100000,  "originalCount": 40,  "remaining": 22 }
        // ...
      ],
      "computed": {
        "originalTickets": 15060000,
        "fractionRemaining": 0.58,
        "ticketsRemaining": 8734800,
        "remainingPrizeValue": 41200000,
        "evPerTicket": 4.72,
        "roi": 0.157,
        "topPrizesRemaining": 3
      }
    }
  ]
}
```

Keep a rolling history (`/data/history/scratchers-YYYY-MM-DD.json` or just rely
on git commits) so the app can chart EV/top-prizes-remaining over time.

---

## 6. App screens (mobile)

1. **Home / Rankings** — scratch-off games sorted by EV or ROI; each card shows
   price, EV per ticket, ROI, top prizes remaining, and a freshness timestamp.
   Filters: by price point, "has top prize remaining," minimum ROI.
2. **Game detail** — full prize-tier table (amount / original / remaining),
   estimated tickets remaining, EV trend chart, link to the official page.
3. **Draw games / Jackpots** — current jackpots, rollover streak, jackpot trend.
4. **Refresh & status** — last-updated time, manual refresh button, scrape health.

PWA essentials: web app manifest (name, icons, theme color), service worker for
offline caching of the last-fetched data, `Add to Home Screen`, HTTPS.

---

## 7. Build phases (milestones)

- **Phase 0 — Recon (do this first).** Manually inspect the target state's
  scratch-off pages. Confirm: is the data in static HTML or loaded by JS? Is
  there a hidden JSON/XHR endpoint (check the browser Network tab — often easier
  and more stable than HTML scraping)? Note the URL patterns and fields. Read
  `robots.txt` and the site Terms.
- **Phase 1 — Scraper + math (CLI).** Node script that scrapes one game list,
  parses tiers, computes EV, prints/writes JSON. Get the numbers right before any UI.
- **Phase 2 — Scheduling + storage.** Wrap the scraper in a GitHub Action on a
  cron; commit `data/*.json` back to the repo.
- **Phase 3 — PWA shell.** Vite + React + Tailwind + `vite-plugin-pwa`; fetch and
  render the JSON as a ranked list; deploy to Cloudflare Pages.
- **Phase 4 — Detail + trends + refresh.** Game detail screen, EV/jackpot charts
  from history, manual refresh via `workflow_dispatch`.
- **Phase 5 — Polish.** Offline caching, install prompt, filters, freshness/health
  indicators, error states when the scrape fails or the page layout changes.

---

## 8. Risks & how to handle them

- **Site layout changes break the scraper.** Isolate parsing in one module with
  a schema check; if fields are missing, fail loudly (the Action errors) rather
  than publishing garbage. Prefer a hidden JSON/XHR endpoint over HTML if one
  exists — far more stable.
- **JS-rendered pages.** Fall back to Playwright.
- **Terms of Service / robots.txt.** Personal, low-frequency, cached scraping is
  low-risk, but check the site's terms and `robots.txt`, identify a sane
  User-Agent, scrape gently (daily, not hammering), and cache aggressively.
- **EV is an estimate, not truth.** "Tickets remaining" is derived; label it as
  an estimate and never imply guaranteed profit. It ranks games; it doesn't
  promise wins.
- **Responsible-gambling framing.** Since it's for you, just keep expectations
  honest — the tool finds the least-bad games, and most stay below break-even.

---

## 9. Open questions to resolve before Phase 1

1. **Which state/national lottery** exactly? (Determines the scraper's target
   URLs and HTML/JSON structure — the single biggest unknown.)
2. Does that site expose a **JSON/XHR endpoint** for prizes-remaining? (Check
   Network tab — hugely simplifies and stabilizes the scraper.)
3. Preferred **scrape frequency** (once daily is plenty for this data).
4. Do you want **jackpot/draw-game** tracking in v1, or ship scratch-offs first
   and add draws later? (Recommend: scratch-offs first.)
```
