import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { LiteGame } from "../types.js";

const GAMES_URL = "https://www.coloradolottery.com/en/games/scratch/";

/**
 * Colorado Lottery — Scratch games, LITE adapter (top prize only, NO EV).
 *
 * The Scratch games index (`#game-list`) is server-rendered: every `<li>` is a
 * game whose `.hover` flyout carries the machine-readable facts —
 *   Ticket Price | Top Prize | Top Prizes Remaining | Last Day to Claim |
 *   Overall Odds
 * The game number is the trailing id in the game's detail-page slug
 * (…/game/<slug>-<id>/).
 *
 * WHY LITE (no EV): the index (and the per-game pages) publish the headline top
 * prize and how many top prizes remain, but not the full prize ladder with
 * original vs. remaining counts per tier. Without the low/mid tiers that carry
 * most of a scratch game's expected value, any EV would be systematically wrong.
 * We expose top-prize + closing-soon data only.
 *
 * closingSoon = the game has an announced "Last Day to Claim" date (i.e. it is
 * ending / claim window is set), or its top prizes are all gone.
 */

/** Parse "$3,000,000" / "2" -> number, blanks -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,%\s]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Format a dollar amount as "$1,000,000". */
function fmtDollars(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

/** Pull a "Label: <strong>value</strong>" field out of the flyout HTML. */
function field($: cheerio.CheerioAPI, $hover: cheerio.Cheerio<any>, label: string): string {
  let value = "";
  $hover.find("p").each((_, p) => {
    const t = $(p).text().trim();
    // Require the trailing colon so "Top Prize:" does not also match
    // "Top Prizes Remaining:".
    if (t.startsWith(label + ":")) {
      value = $(p).find("strong").first().text().trim();
    }
  });
  return value;
}

export function parseCo(html: string): LiteGame[] {
  const $ = cheerio.load(html);
  const games: LiteGame[] = [];

  $("#game-list > li").each((_, li) => {
    const $li = $(li);
    const href = $li.find("a.flyoutTrigger").first().attr("href") ?? "";
    const idMatch = /\/game\/.*?-(\d+)\/?$/.exec(href);
    const gameId = idMatch ? idMatch[1] : "";

    const $hover = $li.find(".hover").first();
    const name = ($hover.find("p.title").first().text() || $li.find("p.title").first().text()).trim();
    const price = num(field($, $hover, "Ticket Price"));
    const topPrizeRaw = field($, $hover, "Top Prize");
    const topPrizesRemaining = num(field($, $hover, "Top Prizes Remaining"));
    const lastClaim = field($, $hover, "Last Day to Claim");

    if (!gameId || !name || !Number.isFinite(price)) return;

    const topPrizeValue = Number.isFinite(num(topPrizeRaw)) ? num(topPrizeRaw) : null;
    const topPrize = topPrizeValue !== null ? fmtDollars(topPrizeValue) : topPrizeRaw.trim();

    const hasClaimDate = lastClaim !== "" && lastClaim.toLowerCase() !== "none";
    const topGone = Number.isFinite(topPrizesRemaining) && topPrizesRemaining === 0;
    const closingSoon = hasClaimDate || topGone;

    games.push({ gameId, name, price, topPrize, topPrizeValue, closingSoon });
  });

  return games;
}

/** Fetch and parse live CO scratch-game data (LITE: top prize + closing-soon). */
export async function scrapeCo(): Promise<{ source: string; games: LiteGame[] }> {
  const html = await fetchText(GAMES_URL);
  const games = parseCo(html);
  if (games.length === 0) {
    throw new Error(
      "CO parser found 0 games — the Scratch games index layout may have changed.",
    );
  }
  return { source: GAMES_URL, games };
}
