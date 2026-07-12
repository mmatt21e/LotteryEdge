import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { LiteGame } from "../types.js";

const PRIZES_URL = "https://www.delottery.com/Instant-Games/Top-Prizes-Remaining";

/**
 * Delaware Lottery — instant games, LITE adapter (top prize only, NO EV).
 *
 * The "Top Prizes Remaining" page is a single static HTML table with columns:
 *   Game Number | Game Name | Dollar Amount | Top Prize |
 *   Total Top Prizes | Prizes Remaining
 *
 * WHY LITE (no EV): Delaware publishes only the game's headline top-prize tier
 * and how many of THAT tier remain — not the full prize ladder or per-tier
 * original/remaining counts for the low/mid tiers that carry most of a scratch
 * game's expected value. There is nothing to build a defensible EV from, so we
 * expose top-prize + closing-soon data only.
 */

/** Parse "$1,000" / "$1" / "7" -> number, blanks -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,%\s]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

export function parseDe(html: string): LiteGame[] {
  const $ = cheerio.load(html);
  const games: LiteGame[] = [];

  $("table tbody tr").each((_, tr) => {
    const tds = $(tr).find("td").toArray();
    if (tds.length < 6) return;

    const gameId = $(tds[0]).text().trim();
    const name = $(tds[1]).text().trim();
    const price = num($(tds[2]).text());
    const topPrize = $(tds[3]).text().trim();
    const topPrizeValue = Number.isFinite(num(topPrize)) ? num(topPrize) : null;
    const remaining = num($(tds[5]).text());

    if (!gameId || !name || !Number.isFinite(price)) return;

    // Delaware publishes no explicit "closing soon" flag; the only ending
    // signal is the top tier being fully claimed (0 top prizes remaining).
    const closingSoon = Number.isFinite(remaining) && remaining === 0;

    games.push({ gameId, name, price, topPrize, topPrizeValue, closingSoon });
  });

  return games;
}

/** Fetch and parse live DE instant-game data (LITE: top prize + closing-soon). */
export async function scrapeDe(): Promise<{ source: string; games: LiteGame[] }> {
  const html = await fetchText(PRIZES_URL);
  const games = parseDe(html);
  if (games.length === 0) {
    throw new Error(
      "DE parser found 0 games — the Top Prizes Remaining table layout may have changed.",
    );
  }
  return { source: PRIZES_URL, games };
}
