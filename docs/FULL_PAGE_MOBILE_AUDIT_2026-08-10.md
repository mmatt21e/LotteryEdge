# LotteryEdge full-page mobile audit

Date: 2026-08-10
Branch: `improve/full-page-mobile-navigation-20260810`

## Outcome

LotteryEdge now treats internal destinations as pages rather than overlays. State selection, filters, the budget helper, the app menu, help, and game details use one edge-to-edge page shell with a visible Back control. Nested paths return one level at a time while keeping the prior screen mounted, so unfinished filters, form values, and scroll context are retained.

Native or external actions remain intentional exceptions: Web Share, install and notification prompts, telephone links, and official lottery or retailer links continue to use the operating system or a new browser tab.

## Design basis

This pass extends the comparable-product research in [UI_ANALYSIS_2026-08-08.md](UI_ANALYSIS_2026-08-08.md). The retained lessons are stable task-based bottom navigation, one primary job per destination, immediate value information, progressive disclosure for advanced analysis, large phone-safe controls, and explicit trust language. This pass changes the earlier bottom-sheet recommendation: secondary destinations now occupy the full viewport and behave like pages.

## Navigation model

- Every internal child destination uses a fixed, `100dvh` page shell rendered above the application root.
- The header contains an accessible page title and Back control and respects device safe areas.
- Opening a child page adds a same-URL history entry, avoiding GitHub Pages deep-route failures.
- Browser Back, the visible Back control, and Escape unwind one page.
- Nested paths such as Menu → How it works and Filters → Budget preserve the parent page and return to it.
- Only the top page is interactive; the application root and covered parent pages are inert.
- The document is locked while a page is open and restored after the final page closes.

## Screen-by-screen evaluation

| Surface | Mobile-first decision | Validation target |
|---|---|---|
| Best | Keep search and the filter entry point close to the ranked cards; open a game as a full page. | First useful card remains near the top; no 320px overflow. |
| Trends | Keep period selection close to results; retain custom dates only when requested; game rows open full pages. | Chips and date inputs wrap cleanly; prior scroll returns. |
| Places | Lead with the official retailer finder; keep posted-winner history secondary and clearly qualified. | External destination is announced; long retailer text wraps. |
| Tickets | Lead with actual spent/won/net and one labeled logging job; make pending results obvious; keep deep comparison secondary. | Inputs have persistent labels, controls are thumb-sized, and the insights table cannot widen the page. |
| All States | Preserve state chips and filters while using the same card-to-detail page path. | Filter state survives a detail round trip. |
| Lite states | Preserve the limited-data explanation and official links without implying unavailable EV analysis. | No dead-end navigation; official links remain explicit. |
| State | Full-page searchable state chooser. | Selection returns to the exact calling screen. |
| Filters | Full-page control workspace with an immediate results action. | Best, All States, and Lite variants show only relevant controls. |
| Budget | Nested full page launched from Filters. | Back returns to unchanged Filters. |
| Menu | Full-page utility destination for refresh, install, appearance, help, alerts, and retailer access. | Utility actions remain distinct from navigation. |
| How it works | Nested explanatory page. | Back returns to Menu rather than the base screen. |
| Game overview | Concise full-page decision summary with share and favorite actions. | Core value, odds, confidence, and next actions fit a phone-first hierarchy. |
| Game analysis tools | Deep history, analysis, prize data, simulation, winner locations, and ticket logging are separated from the overview. | Each destination has one job and returns to the same game overview state. |
| Loading/offline/error/empty | Keep status language within the current top-level destination. | No overlay or blocked exit; stale data remains clearly identified. |

## Fixed evaluation rubric

| Criterion | Weight | Baseline | Round 1 | Round 2 | Final |
|---|---:|---:|---:|---:|---:|
| Full-page navigation coverage | 25% | 1.5/10 | 9.3/10 | 9.6/10 | 9.8/10 |
| Return, history, and state preservation | 20% | 4.0/10 | 5.0/10 | 7.7/10 | 9.5/10 |
| Mobile ergonomics and responsiveness | 20% | 7.5/10 | 9.0/10 | 9.3/10 | 9.4/10 |
| Page hierarchy and content simplification | 15% | 6.0/10 | 6.8/10 | 9.1/10 | 9.4/10 |
| Accessibility and clarity | 10% | 7.0/10 | 8.5/10 | 8.6/10 | 9.4/10 |
| Functional integrity | 10% | 9.5/10 | 9.2/10 | 9.4/10 | 9.7/10 |
| **Weighted total** | **100%** | **52.3/100** | **79.2/100** | **89.7/100** | **95.5/100** |

Round 1 was kept because it converted every former overlay and substantially improved mobile ergonomics. It was not accepted as final because repeated or stale history entries could leave a page mounted and document scrolling locked. The next pass treats deterministic Back behavior as a release requirement.

## Acceptance checks

- No `.sheet-backdrop`, `role="dialog"`, or `aria-modal` remains in the internal navigation flow.
- State, Filters, Budget, Menu, How it works, and Detail cover the complete viewport.
- Menu → How it works and Filters → Budget unwind one level at a time.
- Visible Back, browser Back, Escape, repeated Back, and stale-entry recovery release scroll and inert state.
- Detail opened from Best, Trends, or All States returns to the prior list and position.
- All screens remain free of horizontal page overflow at 320 by 700 and 390 by 844.
- Safe areas, sticky headers, focus movement/restoration, keyboard focus, and reduced motion are preserved.
- State selection, filters, budget recommendations, favorites, sharing, analysis, simulation, official links, alerts, theme, ticket logging, and results entry remain available.
- Unit tests, type checking, production build, and whitespace validation pass.

## Final verification

- Final independent review: **95.5/100 — accepted**.
- Web tests: **40/40 passed**.
- Repository tests: **84/84 passed**.
- Web production build: passed.
- Repository TypeScript check: passed.
- `git diff --check`: passed.
- 320 by 700: no horizontal overflow; the game overview, Tickets, child pages, and icon-only accessible Back header remain usable.
- 390 by 844: document width 375; Menu → How it works → Menu and Filters → Budget → Filters unwind correctly; both nested shells measure 390 by 844.
- 1280 by 900: full shell measures 1280 by 900 with a centered 720-pixel header and 640-pixel content column.
- Three repeated Filters open/Back cycles and a rapid double-Back each restored body/document scrolling and removed inert state.
- Detail returned to the exact prior list position: 2105 pixels before opening and 2105 pixels after closing.
- Purchase logging announced `1 ticket added to My Tickets.` through a polite live status.

## Low residual risks

- The history unit tests cover pure stack interpretation; the verified browser matrix currently provides the integration coverage for `popstate`, lock cleanup, and focus/scroll behavior.
- A browser that completely swallows a history traversal uses a timed stale-marker fallback. Normal, repeated, rapid, and nested Back paths were verified; the swallowed-traversal-only path remains theoretical.
