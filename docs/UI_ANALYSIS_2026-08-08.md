# LotteryEdge mobile-first UI analysis

Date: 2026-08-08

## Outcome

LotteryEdge already has a trustworthy data model and a capable mobile PWA, but its first screen presents too many equally prominent choices before the user reaches the ranked games. The redesign keeps the analysis power while organizing it around four plain-language jobs:

1. **Picks** — find a good game quickly.
2. **Trends** — see what is selling.
3. **Places** — find retailers and posted winner locations.
4. **Tickets** — log purchases and results.

These destinations belong in a persistent bottom navigation. Search and a small set of common filters stay near the ranked list; advanced sorting, filtering, settings, and explanations move into labeled sheets.

## Existing interface audit

### What already works well

- The app is single-column, installable, theme-aware, and uses safe-area padding.
- State selection is searchable and honestly separates full, limited, and unavailable data.
- Ranked cards expose the metrics serious users need: ticket price, estimated net per dollar, profit odds, top prizes remaining, confidence, and trends.
- Bottom sheets already provide dialog semantics, Escape handling, focus movement, and focus restoration.
- Estimates, sample history, stale data, failed refreshes, and responsible-play limitations are disclosed instead of being presented as guarantees.
- Tests cover core formatting, retailer matching, and analytics.

### Main usability problems

#### 1. The first answer is pushed below a control wall

At a 390 by 844 mobile viewport, the initial screen shows the brand, three to four utility buttons, a state selector, a long freshness string, a retailer call-to-action, four section tabs, search, a price row, a top-prize row, sorting, five toggle buttons, and a sort note before the first ranked game is visible.

Impact: a first-time user must interpret the entire product before getting the product's main answer.

#### 2. Top-level navigation is visually dense and out of thumb reach

The four sections are presented as a segmented control near the top. On a long ranked list, switching sections requires returning to the top. The control also looks similar to the filter chips directly below it.

Impact: global navigation and local filtering are easy to confuse.

#### 3. Filters are optimized for power users, not first use

The default ranking exposes every price, four top-prize thresholds, six sort modes, favorites, top-prize availability, ending-soon, after-tax, and budget actions at once.

Impact: common actions and advanced analysis have equal visual weight.

#### 4. Cards require too much scanning

Each card contains a price badge, game name, favorite control, value bar, estimated net per dollar, confidence, possible ending state, odds to profit, top-prize value, prizes remaining, and a trend sparkline.

Impact: the ranking is mathematically rich but visually repetitive; the primary comparison number is not dominant enough.

#### 5. Game detail is one very long destination

The detail sheet combines headline KPIs, trends, daily sales, prior-day prizes, history, confidence, plain-language interpretation, projections, top-prize chase math, full analysis, simulator, prize tables, winner locations, official links, and ticket logging.

Impact: the sheet is powerful but difficult to re-enter for one specific task. A future refinement should divide it into Summary, Prizes, Trends, and Tools views while keeping quick ticket logging available.

#### 6. Utility actions compete with content

Theme, help, install, refresh, and retailer-finder actions are all useful, but most are not primary on every visit.

Impact: persistent utility icons consume header attention without helping users compare games.

## Comparable-app research

The research focused on behavior users repeatedly reward, not on copying any product's visual identity.

### NC Lottery Official Mobile App

The App Store listed a 4.2 rating from about 16,000 ratings. Its prominent jobs are ticket checking, favorites/play access, customized alerts, account management, and retailer finding. The strongest lesson for LotteryEdge is direct task access. Negative reviews also describe difficulty reaching non-play/account areas, reinforcing the need for stable and explicit navigation.

Sources: [NC Lottery App Store listing](https://apps.apple.com/us/app/nc-lottery-official-mobile-app/id1288107282), [NC Lottery mobile app overview](https://nclottery.com/mobileapp).

### ScratchOdds

The Google Play description and positive reviews emphasize remaining-prize counts, current odds, side-by-side comparison, quick search, budget recommendations, and goal-based views such as best overall, jackpot, mid-size wins, and break-even.

The strongest lesson is to lead with the user's goal and reveal the underlying math afterward.

Source: [ScratchOdds on Google Play](https://play.google.com/store/apps/details?id=com.scratchodds.production).

### Jackpocket

Google Play listed a 4.4 rating from about 14,600 reviews. The experience focuses on a small number of repeated jobs: choose a game, see results, save recurring preferences, and receive winning alerts.

The transferable lesson is a short, stable mobile task loop with notifications and favorites supporting it.

Sources: [Jackpocket on Google Play](https://play.google.com/store/apps/details?id=com.jackpocket), [Jackpocket product overview](https://jackpocket.com/).

### Platform guidance

- Apple recommends a persistent tab bar for top-level sections, fewer tabs, and icon-plus-label items with short labels. Tabs should represent destinations rather than actions.
- WCAG 2.2 requires pointer targets of at least 24 by 24 CSS pixels, with spacing exceptions. This redesign uses 44 to 48 pixel primary targets for more comfortable one-handed use.
- Progressive disclosure keeps common actions visible and moves infrequent or advanced controls into a secondary surface.

Sources: [Apple tab-bar guidance](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [web.dev UI patterns](https://web.dev/learn/design/ui-patterns/).

Ratings and feature lists are a dated 2026-08-08 snapshot and can change.

## Recommended information architecture

### Global shell

- Compact brand header.
- State selector and concise freshness status.
- One clearly labeled utility/menu action for refresh, install, appearance, and help.
- Persistent bottom navigation with Picks, Trends, Places, and Tickets.
- Offline status remains visible when applicable.

### Picks

- Page title and one-sentence explanation.
- Search field.
- A short row of common choices.
- A Filter and sort button showing the active-filter count.
- Ranked cards with one dominant value metric and two supporting facts.
- Advanced price, prize, confidence, tax, budget, and sort controls in a bottom sheet.

### Trends

- Time-window choice first.
- Ranked sales list second.
- Sample-data explanation localized to this page.

### Places

- Official retailer finder as the primary call-to-action.
- Posted winner locations as supporting evidence, clearly labeled as incomplete and not predictive.

### Tickets

- Add purchase first.
- Pending results next.
- Spending and outcome summary after the immediate task.
- Mathematical comparison remains secondary and clearly marked as estimated.

## Visual and interaction direction

- Preserve the restrained navy, gold, green, and warm-loss palette, but increase surface separation and whitespace.
- Use the gold accent for selected navigation and primary calls-to-action, not for every active filter simultaneously.
- Use sentence case and plain terms: Picks, Trends, Places, Tickets, Filter and sort.
- Keep numeric information aligned and use tabular numbers where comparisons matter.
- Avoid horizontal page overflow at 320px. Horizontally scrolling chip rows are acceptable only when their affordance is obvious and the first choices remain fully visible.
- Respect reduced-motion settings and safe-area insets.

## Fixed improvement rubric

| Criterion | Weight | Baseline | Excellent result |
| --- | ---: | ---: | --- |
| Task simplicity and navigation | 25% | 5.0/10 | Main jobs are obvious and reachable in one tap. |
| Mobile ergonomics | 20% | 6.0/10 | Bottom navigation, safe areas, 44px targets, no 320px overflow. |
| Information hierarchy and progressive disclosure | 20% | 3.5/10 | Primary answer first; advanced controls are available but secondary. |
| Accessibility and clarity | 15% | 7.0/10 | Labeled semantic controls, selected states, strong focus and contrast. |
| Trust and responsible-use cues | 10% | 8.5/10 | Freshness and estimate limits are concise, visible, and non-alarmist. |
| Functional integrity | 10% | 9.0/10 | Existing features remain available and tests/build pass. |

Weighted baseline: **59.5/100**.

## Verification plan

- Run all existing web tests and a production build.
- Inspect at 320 by 700, 390 by 844, and a desktop viewport.
- Confirm no horizontal overflow.
- Confirm bottom navigation remains visible and respects the bottom safe area.
- Confirm state selection, all four destinations, search, filter/sort controls, theme, help, refresh, official retailer link, favorites, detail opening, and ticket logging remain reachable.
- Confirm keyboard focus is visible and tabs expose their selected state.
- Confirm responsible-play and estimate wording remain present.

## Implemented redesign

The mobile-first simplification was implemented on the `improve/mobile-first-ui-20260808` branch.

- Replaced the crowded top-level segmented control with persistent, icon-and-label bottom navigation: **Best**, **Trends**, **Places**, and **Tickets**.
- Consolidated install, appearance, help, refresh, and secondary retailer access into one app menu.
- Kept search visible while moving price, prize, favorites, ending-state, tax, budget, and sorting controls into a filter sheet.
- Added an active-filter count, plain-language filter summary, and one-tap Reset outside the sheet.
- Reworked game cards around one dominant value answer, two supporting facts, confidence, and a separate favorite target.
- Made the official retailer finder the first action in Places and separated it from **Posted winner history**.
- Preserved a separate scroll position for each top-level destination; an unvisited destination opens at the top.
- Added phone-safe spacing, safe-area support, reduced-motion handling, semantic tab relationships, and 44-pixel-or-larger primary targets.
- Removed sparklines through the phone breakpoint while retaining them on wider screens.

## Improvement results

| Stage | Score | Main change |
| --- | ---: | --- |
| Baseline | 59.5/100 | Dense single-view interface with competing controls. |
| Pass 1 | 83.6/100 | Bottom navigation, progressive filters, simplified cards, consolidated menu. |
| Pass 2 | 90.9/100 | Clearer labels, official finder priority, compact phone cards, complete filter summaries. |
| Pass 3 | **94.9/100 — PASS** | Scroll-state behavior, full-phone density, target sizing, tab semantics, Places hierarchy. |

The final independent review accepted the implementation as satisfying the mobile-first simplification request without a verified layout or functional regression.

## Verified end state

- 320 by 700: viewport width 320, document width 305; no horizontal overflow; four navigation targets each 71 by 54 pixels.
- 390 by 844: viewport width 390, document width 375; no horizontal overflow; four navigation targets each 86 by 54 pixels.
- 1280 by 900: viewport width 1280, document width 1265; centered 608-pixel main content; desktop sparklines retained.
- Reset target: 49 by 44 pixels.
- All four tabs reference the mounted `main-panel` region.
- Scroll behavior: a first visit opened at 0; Best restored to 1800; Places restored to 600.
- Web tests: 38 of 38 passed.
- Full repository tests: 82 of 82 passed.
- Production PWA build, TypeScript typecheck, and patch whitespace check passed.

## Low-priority follow-ups

These do not block acceptance but are useful candidates for a later refinement:

- Namespace saved tab scroll positions by state as well as destination.
- Add screen-reader-only wording that the official retailer finder opens a new tab.
- Expose the complete active-filter summary as an accessible label when visible text is truncated on a narrow screen.
