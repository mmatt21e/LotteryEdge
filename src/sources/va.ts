import type { RawGame } from "../types.js";

/**
 * Virginia scraper — SCAFFOLD.
 *
 * valottery.com/scratcher-search is an Angular app (`ng_fw.loadGame(...)`);
 * the prize data is loaded by a background XHR, not present in the initial
 * HTML. Two ways to finish this, in order of preference:
 *
 *   1. Reverse-engineer the JSON endpoint (BEST — stable, fast, no browser):
 *      - Open valottery.com/scratcher-search in a desktop browser.
 *      - Open DevTools > Network > filter XHR/Fetch.
 *      - Trigger a game load; find the request returning game + prize JSON.
 *      - Implement fetchVaJson() below to call it directly.
 *
 *   2. Headless render with Playwright (fallback — heavier, more brittle):
 *      - `npm i playwright` (Chromium is already at /opt/pw-browsers here).
 *      - Launch, goto the page, wait for the game list, read the DOM / or
 *        intercept the same XHR response and return its body.
 *
 * Until one is implemented, this returns [] so the NC pipeline runs unaffected.
 */
export async function scrapeVa(): Promise<{ source: string; games: RawGame[] }> {
  throw new Error(
    "VA scraper not implemented yet. Grab the XHR endpoint from valottery.com/scratcher-search " +
      "(DevTools > Network) and implement fetchVaJson(), or add a Playwright render. " +
      "See src/sources/va.ts for the two options.",
  );
}

/**
 * TODO(phase-1b): implement once the endpoint is known.
 * Map the VA JSON response into RawGame[] with the same shape NC produces:
 *   { state:"va", gameId, name, price, url, tiers:[{amount,odds?,originalCount,remaining}] }
 * so computeStats() works identically for both states.
 */
// async function fetchVaJson(): Promise<RawGame[]> { ... }
