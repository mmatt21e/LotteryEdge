import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { LiteGame } from "../types.js";

/**
 * New Mexico Lottery — Scratchers, LITE adapter (top prize only, NO EV).
 *
 * The public page
 * https://www.nmlottery.com/games/scratchers/top-prizes-not-yet-claimed/ is
 * JS-rendered: an inline script does
 *   $.get("https://nmlotteryscratchers.sks.com/ScratchersPrize/GetTopPrizesHtml")
 * and injects the returned markup into `#scratchersPrizes`. That endpoint is the
 * curl-reachable data source; it serves a plain HTML table with columns:
 *
 *   Ticket Cost | Game # | Game Name | Top Prize Amount | Top Prizes Remaining
 *
 * WHY LITE (no EV): the feed publishes only each game's TOP prize tier and the
 * count of those top prizes still unclaimed — no full prize ladder, no per-tier
 * original counts, no percent-sold. There is nothing to build a defensible
 * expected value from, so we expose top-prize + closing-soon only, matching the
 * Vermont adapter's rationale.
 *
 * CLOSING-SOON: with no sell-through data published, we flag a game as closing
 * soon when it has <=1 of its top prizes left (last-chance at the jackpot).
 */

const PRIZES_URL = "https://nmlotteryscratchers.sks.com/ScratchersPrize/GetTopPrizesHtml";

/** A game is "closing soon" when at most one of its top prizes remains. */
const CLOSING_SOON_TOP_PRIZES_LEFT = 1;

/** Parse "$200,000" / "1,234" / "$5" -> number, blanks -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,%\s]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

export function parseNm(html: string): LiteGame[] {
  const $ = cheerio.load(html);
  const games: LiteGame[] = [];

  $("table tbody tr").each((_, tr) => {
    const tds = $(tr).find("td").toArray();
    if (tds.length < 5) return;

    const price = num($(tds[0]).text());
    const gameId = $(tds[1]).text().trim();
    const name = $(tds[2]).text().trim();
    const topPrizeValue = num($(tds[3]).text());
    const topPrizesRemaining = num($(tds[4]).text());

    // Skip header/non-data rows.
    if (!Number.isFinite(price) || !gameId || !name) return;

    const topPrize = Number.isFinite(topPrizeValue)
      ? "$" + topPrizeValue.toLocaleString("en-US")
      : $(tds[3]).text().trim();

    const closingSoon =
      Number.isFinite(topPrizesRemaining) &&
      topPrizesRemaining <= CLOSING_SOON_TOP_PRIZES_LEFT;

    games.push({
      gameId,
      name,
      price,
      topPrize,
      topPrizeValue: Number.isFinite(topPrizeValue) ? topPrizeValue : null,
      closingSoon,
    });
  });

  return games;
}

/** Fetch and parse live NM scratcher data (LITE: top prize + closing-soon). */
export async function scrapeNm(): Promise<{ source: string; games: LiteGame[] }> {
  const html = await fetchText(PRIZES_URL);
  const games = parseNm(html);
  if (games.length === 0) {
    throw new Error(
      "NM parser found 0 games — the GetTopPrizesHtml table layout may have changed.",
    );
  }
  return { source: PRIZES_URL, games };
}
