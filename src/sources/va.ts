import type { RawGame } from "../types.js";

/**
 * Virginia scraper — BLOCKED on data availability (see findings below).
 *
 * Unlike NC (which publishes a clean public "prizes remaining" table for every
 * prize level), valottery.com does NOT expose per-tier prizes-remaining data
 * publicly. Seven discovery passes (scripts/va-discovery.mjs history) found:
 *
 *   ✅ Game list:  POST https://www.valottery.com/api/v1/scratchers
 *        body: `page=0&totalPages=0&pageSize=18&filters[categories][]=all`
 *        (form-encoded; needs the site session cookie — GET/plain fetch 302s;
 *         must run via Playwright with the page's own jQuery/session)
 *        → per game: { Title, GameID, TicketPrice, TopPrize, IsClosingSoon }
 *        i.e. TOP-PRIZE level + a real "closing soon" flag only.
 *
 *   ❌ Per-tier prizes remaining + odds + totals (needed for EV / net-per-$1):
 *        - NOT in the list response
 *        - NOT server-rendered on the /scratchers/{GameID} page (that page is
 *          the online-gaming shell)
 *        - /api/v1/prizesandodds is for DRAW games (needs drawingDate), not
 *          scratchers
 *        - /api/v1/scratchers/{GameID} and /api/v1/scratchers/prizesremaining
 *          exist (return 500 to anonymous) but are gated; their data/params
 *          were not obtainable in discovery
 *        - myvirginialottery.com does not resolve
 *
 * Consequence: the EV engine (which estimates tickets remaining from per-tier
 * remaining × odds) cannot run for VA with public data. Options tracked with
 * the user: ship a "VA lite" (list + top prize + closing-soon, no EV), keep
 * probing the gated routes, or use a third-party aggregator (dependency/ToS).
 */
export async function scrapeVa(): Promise<{ source: string; games: RawGame[] }> {
  throw new Error(
    "VA blocked: valottery.com does not publicly expose per-tier prizes-remaining data " +
      "required for EV. Game list is available (POST /api/v1/scratchers) but only carries " +
      "top-prize + closing-soon. See src/sources/va.ts for full findings.",
  );
}
