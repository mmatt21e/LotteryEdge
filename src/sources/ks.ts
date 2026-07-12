import { fetchText } from "./http.js";
import type { LiteGame } from "../types.js";

/**
 * Kansas Lottery ("Play On Kansas") — instant scratch / pull-tab games, LITE
 * adapter (top prize only, NO EV).
 *
 * Source: the scratch-and-pull-tabs landing page. It is a Next.js app; the
 * server-rendered RSC payload embedded in the HTML contains the full
 * `scratchOffs` array (all games, not just the first paginated screen), each
 * with:
 *   gameNumber, title, ticketPrice (number), topPrize (number),
 *   endDate (ISO string | null), pullTab (bool)
 * Because the whole list is in the embedded payload, no per-game detail fetch
 * and no headless browser are needed.
 *
 * WHY LITE (no EV): the embedded list gives the ticket price and a single top
 * prize per game, but not the per-tier prize ladder or remaining/original prize
 * counts, so a per-ticket expected value is not computable. We expose the game
 * list + top prize + a closing-soon flag only.
 *
 * closingSoon heuristic: a game whose `endDate` is set and falls within the next
 * CLOSING_SOON_DAYS is flagged. Games with no end date, or an end date already
 * in the past (still listed during their claim window), are not flagged.
 */

const LIST_URL = "https://playonkansas.com/games/scratch-and-pull-tabs/";
const CLOSING_SOON_DAYS = 60;

interface KsGame {
  gameNumber?: string;
  gameId?: number;
  title?: string;
  ticketPrice?: number;
  topPrize?: number;
  endDate?: string | null;
}

/** Format a dollar amount as "$1,000,000". */
function fmtDollars(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

/**
 * Pull the `scratchOffs` JSON array out of the RSC payload. The payload is
 * embedded as an escaped JSON string (\" for quotes), so we unescape a working
 * copy and bracket-match the array.
 */
function extractScratchOffs(html: string): KsGame[] {
  const unescaped = html.replace(/\\"/g, '"');
  const key = '"scratchOffs":';
  const keyAt = unescaped.indexOf(key);
  if (keyAt === -1) {
    throw new Error('KS: "scratchOffs" array not found in page payload.');
  }
  const start = unescaped.indexOf("[", keyAt);
  if (start === -1) throw new Error("KS: malformed scratchOffs (no opening bracket).");

  let depth = 0;
  let end = -1;
  for (let i = start; i < unescaped.length; i++) {
    const c = unescaped[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) throw new Error("KS: malformed scratchOffs (unbalanced brackets).");

  return JSON.parse(unescaped.slice(start, end)) as KsGame[];
}

export function parseKs(html: string, now: Date = new Date()): LiteGame[] {
  const raw = extractScratchOffs(html);
  const games: LiteGame[] = [];

  for (const g of raw) {
    const gameId = (g.gameNumber ?? (g.gameId != null ? String(g.gameId) : "")).trim();
    const name = (g.title ?? "").trim();
    if (!gameId || !name) continue;

    const price = typeof g.ticketPrice === "number" ? g.ticketPrice : 0;
    const topPrizeValue = typeof g.topPrize === "number" ? g.topPrize : null;

    let closingSoon = false;
    if (g.endDate) {
      const end = new Date(g.endDate);
      if (!Number.isNaN(end.getTime())) {
        const days = (end.getTime() - now.getTime()) / 86_400_000;
        closingSoon = days >= 0 && days <= CLOSING_SOON_DAYS;
      }
    }

    games.push({
      gameId,
      name,
      price,
      topPrize: topPrizeValue !== null ? fmtDollars(topPrizeValue) : "",
      topPrizeValue,
      closingSoon,
    });
  }

  return games;
}

/** Fetch and parse live KS scratch/pull-tab data (LITE: top prize + price). */
export async function scrapeKs(): Promise<{ source: string; games: LiteGame[] }> {
  const html = await fetchText(LIST_URL);
  const games = parseKs(html);
  if (games.length === 0) {
    throw new Error(
      "KS parser found 0 games — the embedded scratchOffs payload may have changed.",
    );
  }
  return { source: LIST_URL, games };
}
