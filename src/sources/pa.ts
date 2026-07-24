import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import { fmtDollars } from "./parse.js";
import type { LiteGame } from "../types.js";

const PRIZES_URL = "https://www.palottery.pa.gov/Scratch-Offs/Prizes-Remaining.aspx";

/**
 * Pennsylvania Lottery — instant games, LITE adapter (top prize only, NO EV).
 *
 * The "Prizes Remaining" page renders a single server-side table
 * (`#remaining-prizes`) with columns:
 *   Game # | Game Name (link) | Price | Top Six Prizes (<div> list) |
 *   Wins Remaining (<div> list)
 *
 * WHY LITE (no EV): the page publishes only the game's top six prize tiers and
 * their remaining win counts — not the full prize ladder and no original/print
 * counts. The low/mid tiers that make up most of a scratch game's expected value
 * are absent, so any EV would be systematically understated. We expose
 * top-prize + closing-soon data only.
 *
 * closingSoon = the top prize tier has zero wins remaining (a strong end-of-life
 * signal on a summary that otherwise carries no sold-percentage).
 */

/** Parse "$2,500" / "43,583" / "1" -> number, blanks -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,%\s]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

export function parsePa(html: string): LiteGame[] {
  const $ = cheerio.load(html);
  const games: LiteGame[] = [];

  $("#remaining-prizes tbody tr").each((_, tr) => {
    const tds = $(tr).find("td").toArray();
    if (tds.length < 5) return;

    const gameId =
      ($(tds[0]).find(".new-game").text().trim() ||
        ($(tds[0]).attr("data-order") ?? "") ||
        $(tds[0]).text()).trim();
    const $a = $(tds[1]).find("a").first();
    const name = ($a.text() || $(tds[1]).text()).trim();
    const price = num($(tds[2]).text());

    if (!gameId || !name || !Number.isFinite(price)) return;

    // Top six prize amounts (already ordered high -> low) and their remaining wins.
    const amounts = $(tds[3])
      .find("div")
      .toArray()
      .map((d) => num($(d).text()))
      .filter((n) => Number.isFinite(n));
    const remaining = $(tds[4])
      .find("div")
      .toArray()
      .map((d) => num($(d).text()));

    const topPrizeValue = amounts.length > 0 ? Math.max(...amounts) : null;
    const topPrize = topPrizeValue !== null ? fmtDollars(topPrizeValue) : "";

    // Match the top tier to its remaining count by index within the ladder.
    const topIdx = amounts.indexOf(topPrizeValue as number);
    const topRemaining = topIdx >= 0 ? remaining[topIdx] : NaN;
    const closingSoon = Number.isFinite(topRemaining) && topRemaining === 0;

    games.push({ gameId, name, price, topPrize, topPrizeValue, closingSoon });
  });

  return games;
}

/** Fetch and parse live PA instant-game data (LITE: top prize + closing-soon). */
export async function scrapePa(): Promise<{ source: string; games: LiteGame[] }> {
  const html = await fetchText(PRIZES_URL);
  const games = parsePa(html);
  if (games.length === 0) {
    throw new Error(
      "PA parser found 0 games — the Prizes Remaining table layout may have changed.",
    );
  }
  return { source: PRIZES_URL, games };
}
