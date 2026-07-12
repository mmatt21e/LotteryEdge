# LotteryEdge — All-US-States Plan

Goal: support every US jurisdiction that runs a lottery (~45 states + DC), each
as a selectable "state" in the app, reusing the NC/VA multi-state foundation.

## The one fact that governs everything

The EV / net-per-$1 engine needs, per game, **per-prize-level remaining
counts** (how many of each prize tier are still unclaimed) + prize amounts +
odds/total-printed. Whether a state can be **full** or only **lite** depends
entirely on whether it publishes that data publicly.

- **NC** publishes it as a clean static HTML table → **full EV**.
- **VA** does not publish per-tier remaining publicly → **lite** (list + top
  prize + closing-soon only).

So states sort into three tiers (filled from research):

- **Tier A — Full EV**: per-tier prizes-remaining public (static HTML, or a
  JSON endpoint). Implement like NC. Highest value, lowest effort.
- **Tier B — Lite**: only top-prize/list data public (like VA). Implement like
  VA's LiteView. Some need a headless browser if gated.
- **Tier C — Unsupported (for now)**: no usable public data / heavily gated.
  Listed in the UI as "not yet available," with the reason.

## Architecture (generalize the NC/VA foundation)

```
src/sources/
  index.ts          # registry: stateKey -> { name, tier, kind, run() }
  http.ts           # polite fetch (shared)
  nc.ts             # Tier A, static HTML (cheerio)  [done]
  va.ts / va-scrape # Tier B, lite via Playmwright   [done]
  <st>.ts           # one adapter per state
  playwright.ts     # shared headless helper for gated states
```

- **Adapter contract:**
  - Full: `run(): Promise<{ source, games: RawGame[] }>` (tiers included) →
    CLI runs `computeStats` + history, writes `data/scratchers-<st>.json`.
  - Lite: `run(): Promise<{ source, games: LiteGame[] }>` → writes a
    `limited:true` file (no EV), rendered by `LiteView`.
- **Registry-driven CLI:** `npm run scrape -- <st|all>` iterates the registry;
  per-state try/catch so one failure never blocks others.
- **Fetch strategy by format:**
  - `STATIC_HTML` → `fetch` + cheerio (cheap; most Tier A).
  - `JSON_API` → `fetch` the endpoint (cheapest; best case).
  - `JS_RENDERED / gated` → Playwright (heavier; used only where required).
- **Workflow:** the daily job scrapes all states. Chromium is installed only
  because ≥1 state needs it; plain-fetch states don't pay that cost at runtime.
  Keep per-state steps non-blocking.
- **Web:** the 2-button NC/VA switch becomes a **searchable state picker**
  (45+ entries, grouped Full vs Lite vs Coming-soon). Full states get the full
  UI; lite states get `LiteView`; unsupported states show a short explainer.
  History/velocity/favorites already key off `state`, so they generalize.

## Phased rollout

1. **Foundation** — multi-state switcher, registry, NC (full) + VA (lite). ✅
2. **Tier A wave** — implement all full-EV states. Batch by format:
   static-HTML states first (NC-like), then JSON-API states (fastest). Each is
   an isolated adapter + a parser test.
3. **Tier B wave** — lite adapters for top-prize-only states (VA-like).
4. **State-picker UX** — searchable/grouped picker, remember recent states,
   maybe favorite states.
5. **Unsupported list** — show Tier C states as "not available (reason)" so the
   coverage is honest and transparent.

## Realistic expectations

- Not all 45 will reach full EV. Based on the NC/VA split and how aggregator
  sites behave, expect a solid majority as **Tier A**, several **Tier B**, and
  a few **Tier C** — the research table below sets the real counts.
- Each Tier-A adapter is a small, testable parser; the work is breadth, not
  depth. Gated states can take VA-level effort — those default to lite.

## Cross-cutting

- **Politeness / ToS:** scrape once daily, cache, identify a User-Agent, respect
  robots.txt. No hammering. Per-state source URLs recorded in each adapter.
- **Data volume:** one JSON per state per day, committed to the repo (history is
  free). Total stays small (tens of KB/state).
- **Resilience:** a broken state parser fails that state only; the app shows its
  last-good data or a "temporarily unavailable" note.

## Per-state classification (from research — filled next)

_Populated from the parallel site-by-site research pass. Columns: State · Tier ·
Format · Prizes-remaining URL · Notes._

<!-- RESEARCH_TABLE -->
