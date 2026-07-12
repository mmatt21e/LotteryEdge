import type { LiteGame } from "../types.js";

const API_URL = "https://www.njlottery.com/api/v1/instant-games/games?size=1000";
const SOURCE = "https://www.njlottery.com/en-us/scratch-offs/active.html";

/**
 * New Jersey Lottery — scratch-offs, LITE adapter (top prize only, NO EV).
 *
 * The "active" scratch-offs grid is rendered client-side from a JSON API (the
 * same endpoint the page's Backbone InstantGames collection fetches):
 *   /api/v1/instant-games/games?size=1000   (single page, all games)
 * Ticket prices and prize amounts are published in CENTS. Each game carries a
 * `prizeTiers` array with { prizeAmount, winningTickets, paidTickets }.
 *
 * The page classifies a game as ACTIVE when:
 *   launchDate <= now  AND  now < (disableDate - 365 days)
 * (the final 365 days before disable is the "ended" tab), which we mirror here.
 * Game numbers are zero-padded to 5 digits to match the site's display.
 *
 * WHY LITE (no EV): NJ publishes per-tier winning/paid counts but no per-tier
 * original ODDS, and the grid's purpose is "top prizes remaining", not a full
 * EV ladder. We expose top-prize + closing-soon data only.
 */

interface NjTier {
  prizeAmount: number;
  winningTickets: number;
  paidTickets: number;
}
interface NjGame {
  gameId: string;
  gameName: string;
  ticketPrice: number;
  launchDate: number;
  disableDate: number;
  prizeTiers?: NjTier[];
}
interface NjResponse {
  games: NjGame[];
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** Flag a game as closing soon when it enters the "ended" window within this span. */
const CLOSING_SOON_MS = 30 * 24 * 60 * 60 * 1000;

/** Format a dollar amount as "$1,000,000". */
function fmtDollars(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

/** Zero-pad a game number to 5 digits, matching the NJ site display. */
function padZeros(id: string): string {
  return id.length < 5 ? id.padStart(5, "0") : id;
}

/**
 * Polite JSON fetch. NJ's API returns 406 for the `Accept: text/html` header
 * that the shared fetchText helper sends, so this adapter asks for JSON.
 */
async function fetchJson(url: string, timeoutMs = 30_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LotteryEdge/0.1 (personal scratch-off EV tool)",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function toLiteGames(all: NjGame[], now: number): LiteGame[] {
  const games: LiteGame[] = [];
  for (const g of all) {
    // Mirror the site's ACTIVE classification.
    const activeUntil = g.disableDate - YEAR_MS;
    if (!(g.launchDate <= now && now < activeUntil)) continue;

    const tiers = g.prizeTiers ?? [];
    const top =
      tiers.length > 0
        ? tiers.reduce((a, b) => (b.prizeAmount > a.prizeAmount ? b : a))
        : null;

    const topPrizeValue = top ? top.prizeAmount / 100 : null;
    const topPrize = topPrizeValue !== null ? fmtDollars(topPrizeValue) : "";

    const topPrizesGone = top ? top.paidTickets >= top.winningTickets : false;
    const closingSoon = topPrizesGone || activeUntil - now < CLOSING_SOON_MS;

    games.push({
      gameId: padZeros(g.gameId),
      name: g.gameName,
      price: g.ticketPrice / 100,
      topPrize,
      topPrizeValue,
      closingSoon,
    });
  }
  return games;
}

/** Fetch and parse live NJ scratch-off data (LITE: top prize + closing-soon). */
export async function scrapeNj(): Promise<{ source: string; games: LiteGame[] }> {
  const data = (await fetchJson(API_URL)) as NjResponse;
  const games = toLiteGames(data.games ?? [], Date.now());
  if (games.length === 0) {
    throw new Error(
      "NJ parser found 0 games — the instant-games API shape may have changed.",
    );
  }
  return { source: SOURCE, games };
}
