import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import { fmtDollars } from "./parse.js";
import type { LiteGame } from "../types.js";

const LIST_URL = "https://lottery.sd.gov/scratch-games/";
const ENDING_URL = "https://lottery.sd.gov/games-ending-soon/";

/**
 * South Dakota Lottery — scratch games, LITE adapter (top prize + closing-soon,
 * NO EV).
 *
 * Two sources are combined:
 *   - /scratch-games/       the full game list. It is a Next.js page whose game
 *     data is embedded verbatim as a JSON `"games":[ ... ]` array in the HTML
 *     (an RSC payload). Each node carries title, gamePrices (e.g. "$10"),
 *     acf.igtIdentifier (the game number), acf.topPrize (sometimes), and
 *     gameOptions ("Active"/"Ended"/"Ending Soon"…). This gives name + price +
 *     top prize.
 *   - /games-ending-soon/   HTML tables listing the game numbers that are
 *     ending soon; used to set closingSoon.
 *
 * WHY LITE (no EV): SD publishes only the top prize and its remaining count, not
 * the full prize ladder or original per-tier counts — nothing to compute an
 * expected value from.
 */

/** Parse "$50,000" / "50,000" / "8888" -> number, blanks -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,%\s]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Extract the embedded `"games":[ ... ]` JSON array from the list-page HTML. */
function extractGamesArray(html: string): unknown[] {
  const key = '"games":[';
  const at = html.indexOf(key);
  if (at < 0) return [];
  const start = at + key.length - 1; // position of the opening '['
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (esc) {
      esc = false;
    } else if (c === "\\") {
      esc = true;
    } else if (c === '"') {
      inStr = !inStr;
    } else if (!inStr) {
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, i + 1));
          } catch {
            return [];
          }
        }
      }
    }
  }
  return [];
}

interface EndingInfo {
  /** Game numbers appearing on the games-ending-soon page. */
  closing: Set<string>;
  /** Game number -> top-prize text scraped from that page (enrichment). */
  topPrize: Map<string, string>;
}

/** Parse the games-ending-soon page: closing game numbers + any top-prize text. */
export function parseEnding(html: string): EndingInfo {
  const $ = cheerio.load(html);
  const closing = new Set<string>();
  const topPrize = new Map<string, string>();

  $("table tr").each((_, tr) => {
    const cells = $(tr)
      .find("td")
      .toArray()
      .map((td) => $(td).text().trim());
    if (cells.length === 0) return;

    let gameNo: string | null = null;
    let prize: string | null = null;
    for (const c of cells) {
      // A bare game number (3-4 digits) in its own column…
      if (/^\d{3,4}$/.test(c)) gameNo = c;
      // …or embedded in the name, e.g. "Game of Thrones - 1128".
      const tail = c.match(/-\s*(\d{3,4})\s*$/);
      if (tail?.[1]) gameNo = tail[1];
      // A dollar amount in the row is the top prize.
      if (/^\$[\d,]+$/.test(c)) prize = c;
    }
    if (gameNo) {
      closing.add(gameNo);
      if (prize) topPrize.set(gameNo, prize);
    }
  });

  return { closing, topPrize };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseList(html: string, ending: EndingInfo): LiteGame[] {
  const edges = extractGamesArray(html);
  const games: LiteGame[] = [];

  for (const edge of edges as any[]) {
    const node = edge?.node;
    if (!node) continue;

    const types: string[] = (node.gameTypes?.nodes ?? []).map((t: any) => t?.name);
    if (!types.includes("Scratch Tickets")) continue;

    const options: string[] = (node.gameOptions?.edges ?? []).map(
      (e: any) => e?.node?.slug,
    );
    // Skip games that have closed (ended for sale and past claim period).
    if (options.includes("closed")) continue;

    const gameId = String(node.acf?.igtIdentifier ?? "").trim();
    const name = String(node.title ?? "").trim();
    const price = num(node.gamePrices?.nodes?.[0]?.name);
    if (!gameId || !name || !Number.isFinite(price)) continue;

    // Prefer the list's own top prize; enrich from the ending-soon page otherwise.
    const acfTop = node.acf?.topPrize;
    const rawTop = acfTop != null && String(acfTop).trim() !== ""
      ? String(acfTop)
      : ending.topPrize.get(gameId);
    const topPrizeValue = rawTop != null ? num(rawTop) : NaN;
    const hasTop = Number.isFinite(topPrizeValue);
    const topPrize = hasTop ? fmtDollars(topPrizeValue) : "";

    const closingSoon = ending.closing.has(gameId) || options.includes("closing-soon");

    games.push({
      gameId,
      name,
      price,
      topPrize,
      topPrizeValue: hasTop ? topPrizeValue : null,
      closingSoon,
    });
  }

  return games;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Fetch and parse live SD scratch-game data (LITE: top prize + closing-soon). */
export async function scrapeSd(): Promise<{ source: string; games: LiteGame[] }> {
  const [listHtml, endingHtml] = await Promise.all([
    fetchText(LIST_URL),
    fetchText(ENDING_URL),
  ]);
  const ending = parseEnding(endingHtml);
  const games = parseList(listHtml, ending);
  if (games.length === 0) {
    throw new Error(
      "SD parser found 0 games — the scratch-games list payload may have changed.",
    );
  }
  return { source: LIST_URL, games };
}
