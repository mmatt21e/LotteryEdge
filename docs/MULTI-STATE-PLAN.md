# LotteryEdge — All-US-States Plan

> **Historical document.** The rollout described here has shipped (37 states
> live). The tier tables below reflect pre-implementation research and drifted
> in places (e.g. VT and KS shipped as lite, VA is currently blocked); the
> source of truth is `src/sources/registry.ts` and `web/src/states.ts`.

Goal: support every US jurisdiction that runs a lottery (~45 states + DC), each
as a selectable "state" in the app, reusing the NC/VA multi-state foundation.

## The one fact that governs everything

The EV / net-per-$1 engine needs, per game, **per-prize-level remaining
counts** (how many of each prize tier are still unclaimed) + prize amounts +
**an odds/total-tickets anchor** (to estimate tickets remaining). Whether a
state can be **full** or only **lite** depends on whether it publishes that data
publicly.

> **Anchor nuance (found while validating MA):** two flavors of Tier A exist —
> (a) pages that publish per-tier **odds** alongside remaining (NC, IA, KY, …)
> plug straight into the current engine; (b) pages that publish per-tier
> **counts + remaining** but no odds (e.g. MA's JSON) need the game's overall
> odds / total-tickets from one extra field or detail fetch. The engine will be
> generalized to accept either an odds anchor or a total-tickets anchor.

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

From a parallel site-by-site research pass over all 46 US lottery jurisdictions.
**Tier A = full per-tier remaining (full EV). Tier B = top-prize/list only
(lite). Tier C = no usable public data.**

### Tier A — full EV (26 states)

Sub-grouped by scrape difficulty.

**A1 · Easy (clean static table or open JSON) — do first**

| State | Format | Source |
|---|---|---|
| North Carolina | static HTML (single table) | nclottery.com/scratch-off-prizes-remaining ✅ built |
| Iowa | static HTML (single table) | ialottery.com/Pages/Games/RemainingPrizes.aspx |
| Kentucky | static HTML | kylottery.com/apps/scratch_offs/prizes_remaining.html |
| South Carolina | static HTML (per-game) | sceducationlottery.com/Games/PrizesRemaining |
| Idaho | static HTML | idaholottery.com/games/scratch |
| Massachusetts | **open JSON API** | masslottery.com/api/v1/instant-game-prizes |
| Maryland | static HTML (per-game) | mdlottery.com/games/scratch-offs/ |
| Texas | static HTML (per-game) | texaslottery.com/.../Scratch_Offs/all.html |
| Vermont | static HTML | vtlottery.com/games/instant-tickets/outstanding-prizes |
| Washington | static HTML (per-game) | walottery.com/Scratch/TopPrizesRemaining.aspx |
| Arkansas | static HTML (per-game) | myarkansaslottery.com/games/instant |
| Connecticut | static HTML (per-game) | ctlottery.org/scratchgames |
| Louisiana | static HTML (per-game) | louisianalottery.com/scratch-offs/ |
| Indiana | static HTML (per-game) | hoosierlottery.com/games/scratch-off/ |
| Mississippi | static HTML (per-game) | mslottery.com/gamestatus/active/ |
| Missouri | static HTML (per-game) | molottery.com/scratchers-list.do |
| California | JSON list + per-game detail | calottery.com/api/Sitecore/ScratchersFilteredList |

**A2 · Harder (JS-rendered / gated / PDF — need Playwright or API discovery)**

| State | Format | Source |
|---|---|---|
| Florida | JS + bot-protected feed | files.floridalottery.com/site/remainingPrizes |
| Ohio | JS/AJAX feed | ohiolottery.com/games/scratch-offs/prizes-remaining |
| Oklahoma | JS (Vue) | lottery.ok.gov/scratchers/remaining-prizes |
| Rhode Island | JS (per-game) | rilot.com/en-us/instantgames.html |
| West Virginia | JS (Drupal) | wvlottery.com/games/scratch-offs |
| Michigan | GraphQL API | michiganlottery.com/api |
| Kansas | JS (site migration) | kslottery.gov game pages |
| New Hampshire | JS | nhlottery.com/prizes/prizes-remaining |
| New York | per-game PDF report | nylottery.ny.gov/scratch-off-games |

### Tier B — lite / top-prize only (16 states, VA-style)

DE, GA*, IL†, NJ, NM, NE, OR, PA, CO, SD, TN‡, WI, DC, ME, MN, **VA** ✅ built.
(*GA locks odds in images. †IL actually publishes full tiers but is 403/JS-gated
— treat as B unless we invest in headless. ‡TN is 403 bot-protected.)

### Tier C — unsupported (4 jurisdictions)

- **North Dakota** — draw games only, no scratch-offs.
- **Wyoming** — draw games only, no scratch-offs.
- **Montana** — publishes odds but no remaining counts.
- **Arizona** — top-prize only + 403 bot-protected.

### Non-lottery states (no lottery at all)

Alabama, Alaska, Hawaii, Nevada, Utah — nothing to add.

## Implementation waves (from this table)

- **Wave 1 (A1 easy):** the 17 clean static/JSON states. Each ≈ NC-effort
  (fetch + cheerio parser, or a JSON map) + a small test. Biggest coverage jump.
- **Wave 2 (A2 hard):** the 9 JS/gated/PDF states via Playwright or API
  reverse-engineering (some may fall back to lite, VA-style, if too gated).
- **Wave 3 (Tier B lite):** 16 top-prize-only states → LiteView.
- **Wave 4:** Tier C shown as "not available (reason)"; searchable state picker
  UX for 40+ entries.
