import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import { fmtDollars } from "./parse.js";
import type { LiteGame } from "../types.js";

const UNCLAIMED_URL = "https://www.mainelottery.com/players_info/unclaimed_prizes.html";

/**
 * Maine Lottery — instant games, LITE adapter (top prize + closing-soon, NO EV).
 *
 * The only machine-readable Maine source is the "Unclaimed Prizes" table, whose
 * columns are:
 *   Price Point | Game No. | Game Name | Percent Unsold | Total Unclaimed |
 *   Top Prize Level(s) | Top Prize(s) Unclaimed
 *
 * WHY LITE (no EV): the table publishes only each game's TOP prize tier(s) and
 * the count still unclaimed at that tier — not the full prize ladder or the
 * original per-tier counts. There is nothing to build an expected value from, so
 * we expose top-prize + closing-soon only.
 *
 * closingSoon is derived from "Percent Unsold": a game with very few tickets
 * left unsold is about to sell out / close.
 */

/** A game with <= this share of tickets still unsold is treated as closing soon. */
const CLOSING_SOON_MAX_UNSOLD_PCT = 5;

/** Parse "$50,000" / "1,000" / "6.1" -> number, blanks -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,%\s]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

export function parseMe(html: string): LiteGame[] {
  const $ = cheerio.load(html);
  const games: LiteGame[] = [];

  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td").toArray();
    // Header row uses <th>; skip anything that isn't a full data row.
    if (tds.length < 7) return;

    const price = num($(tds[0]).text());
    const gameId = $(tds[1]).text().trim();
    const name = $(tds[2]).text().trim();
    if (!Number.isFinite(price) || !gameId || !name) return;

    const pctUnsold = num($(tds[3]).text());

    // "Top Prize Level(s)" can list more than one tier; the headline is the largest.
    const topAmounts = ($(tds[5]).text().match(/\$?\s*[\d,]+(?:\.\d+)?/g) ?? [])
      .map(num)
      .filter((n) => Number.isFinite(n));
    const topPrizeValue = topAmounts.length > 0 ? Math.max(...topAmounts) : null;
    const topPrize = topPrizeValue !== null ? fmtDollars(topPrizeValue) : "";

    const closingSoon = Number.isFinite(pctUnsold) && pctUnsold <= CLOSING_SOON_MAX_UNSOLD_PCT;

    games.push({ gameId, name, price, topPrize, topPrizeValue, closingSoon });
  });

  return games;
}

/** Fetch and parse live ME instant-game data (LITE: top prize + closing-soon). */
export async function scrapeMe(): Promise<{ source: string; games: LiteGame[] }> {
  const html = await fetchText(UNCLAIMED_URL);
  const games = parseMe(html);
  if (games.length === 0) {
    throw new Error(
      "ME parser found 0 games — the Unclaimed Prizes table layout may have changed.",
    );
  }
  return { source: UNCLAIMED_URL, games };
}
