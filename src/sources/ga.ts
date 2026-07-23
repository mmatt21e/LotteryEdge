import { fetchText } from "./http.js";
import { fmtDollars } from "./parse.js";
import type { LiteGame } from "../types.js";

const API_BASE = "https://www.galottery.com/api/v1/instant-games/games/page";
const SOURCE =
  "https://www.galottery.com/en-us/games/scratchers/scratchers-top-prizes-claimed.html";

/**
 * Georgia Lottery — scratchers, LITE adapter (top prize only, NO EV).
 *
 * The "Top Prizes Claimed" page is rendered client-side from a JSON API
 * (the same endpoint the page's Backbone models call):
 *   /api/v1/instant-games/games/page?start-item=N&size=100
 * paginated 100 games at a time until `nextItems` reaches 0. Ticket prices and
 * prize amounts are published in CENTS. Each game carries a `prizeTiers` array
 * with { prizeAmount, winningTickets, paidTickets }.
 *
 * WHY LITE (no EV): the page's own logic reports only the single top tier
 * (highest prizeAmount) and how many of it are claimed — the intent is "top
 * prizes claimed", not a full remaining-prize ladder. While the API does list
 * lower tiers, it publishes NO per-tier original odds and no ticket-pool sizing
 * to spread a defensible EV across, so we expose top-prize + closing-soon only.
 */

interface GaTier {
  prizeAmount: number;
  winningTickets: number;
  paidTickets: number;
}
interface GaGame {
  gameId: string;
  gameName: string;
  ticketPrice: number;
  launchDate: number;
  disableDate: number;
  prizeTiers?: GaTier[];
}
interface GaPage {
  games: GaGame[];
  nextItems: number;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 20; // safety cap
/** Flag a game as closing soon when it disables within this window. */
const CLOSING_SOON_MS = 30 * 24 * 60 * 60 * 1000;

export function toLiteGames(all: GaGame[], now: number): LiteGame[] {
  const games: LiteGame[] = [];
  for (const g of all) {
    // Mirror the site: a game is shown while launched and not yet disabled.
    if (!(g.launchDate <= now && now < g.disableDate)) continue;

    const tiers = g.prizeTiers ?? [];
    const top =
      tiers.length > 0
        ? tiers.reduce((a, b) => (b.prizeAmount > a.prizeAmount ? b : a))
        : null;

    const topPrizeValue = top ? top.prizeAmount / 100 : null;
    const topPrize = topPrizeValue !== null ? fmtDollars(topPrizeValue) : "";

    const topPrizesGone = top ? top.paidTickets >= top.winningTickets : false;
    const closingSoon = topPrizesGone || g.disableDate - now < CLOSING_SOON_MS;

    games.push({
      gameId: g.gameId,
      name: g.gameName,
      price: g.ticketPrice / 100,
      topPrize,
      topPrizeValue,
      closingSoon,
    });
  }
  return games;
}

/** Fetch and parse live GA scratcher data (LITE: top prize + closing-soon). */
export async function scrapeGa(): Promise<{ source: string; games: LiteGame[] }> {
  const all: GaGame[] = [];
  let start = 1;
  for (let page = 0; page < MAX_PAGES; page++) {
    const text = await fetchText(`${API_BASE}?start-item=${start}&size=${PAGE_SIZE}`);
    const data = JSON.parse(text) as GaPage;
    const batch = data.games ?? [];
    if (batch.length === 0) break;
    all.push(...batch);
    if (!data.nextItems || data.nextItems <= 0) break;
    start += PAGE_SIZE;
  }

  const games = toLiteGames(all, Date.now());
  if (games.length === 0) {
    throw new Error(
      "GA parser found 0 games — the instant-games API shape may have changed.",
    );
  }
  return { source: SOURCE, games };
}
