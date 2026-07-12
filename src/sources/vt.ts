import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { LiteGame } from "../types.js";

const PRIZES_URL = "https://vtlottery.com/games/instant-tickets/outstanding-prizes";

/**
 * Vermont Lottery — instant tickets, LITE adapter (top prize only, NO EV).
 *
 * The only machine-readable VT source is the "Outstanding Prizes" table, whose
 * columns are:
 *   Price | Game # | Game Name (link) | Top Prizes (<br> list) |
 *   Unclaimed Top Prizes (<br> list) | Total Unclaimed | % Sold | # Of Tickets
 *
 * WHY LITE (no EV): the table publishes only the game's TOP prize tier(s) and
 * their unclaimed counts — NOT the full prize ladder. A $1 game lists a single
 * $50 tier, so the low/mid prizes that make up the bulk of a scratch game's
 * expected value are absent. Any EV built from top-prize-only data is
 * systematically understated (observed median ROI ≈ 6%, vs ~70% for states that
 * publish the full ladder) and, near sell-out, the lone-jackpot artifact makes
 * it wildly overstated instead. Vermont also publishes no per-tier original
 * counts. "# Of Tickets" (print run) and "% Sold" exist, but with only the top
 * tier's dollar amounts there is nothing to spread that pool across. We
 * therefore expose VT as top-prize + closing-soon data only, and do NOT
 * fabricate an EV.
 */

/** Parse "$50,000" / "294,000" / "17" -> number, blanks -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,%\s]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Split a `<br>`-delimited cell (given its inner HTML) into trimmed lines. */
function lines(html: string | null): string[] {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** Format a dollar amount as "$1,000,000". */
function fmtDollars(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

/** A game is "closing soon" when it is ≥85% sold or its top prizes are all gone. */
const CLOSING_SOON_SOLD_PCT = 85;

export function parseVt(html: string): LiteGame[] {
  const $ = cheerio.load(html);
  const games: LiteGame[] = [];

  $("table tbody tr").each((_, tr) => {
    const tds = $(tr).find("td").toArray();
    if (tds.length < 8) return;

    const price = num($(tds[0]).text());
    const gameId = $(tds[1]).text().trim();
    const $a = $(tds[2]).find("a").first();
    const name = ($a.text() || $(tds[2]).text()).trim();

    if (!Number.isFinite(price) || !gameId || !name) return;

    // Only the TOP prize tier(s) are published; take the largest as the headline.
    const amounts = lines($(tds[3]).html()).map(num).filter((n) => Number.isFinite(n));
    const unclaimedTop = lines($(tds[4]).html()).map(num);
    const soldPct = num($(tds[6]).text());

    const topPrizeValue = amounts.length > 0 ? Math.max(...amounts) : null;
    const topPrize = topPrizeValue !== null ? fmtDollars(topPrizeValue) : "";

    const topPrizesGone =
      unclaimedTop.length > 0 && unclaimedTop.every((c) => Number.isFinite(c) && c === 0);
    const closingSoon =
      (Number.isFinite(soldPct) && soldPct >= CLOSING_SOON_SOLD_PCT) || topPrizesGone;

    games.push({ gameId, name, price, topPrize, topPrizeValue, closingSoon });
  });

  return games;
}

/** Fetch and parse live VT instant-ticket data (LITE: top prize + closing-soon). */
export async function scrapeVt(): Promise<{ source: string; games: LiteGame[] }> {
  const html = await fetchText(PRIZES_URL);
  const games = parseVt(html);
  if (games.length === 0) {
    throw new Error(
      "VT parser found 0 games — the Outstanding Prizes table layout may have changed.",
    );
  }
  return { source: PRIZES_URL, games };
}
