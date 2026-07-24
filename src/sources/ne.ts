import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import { fmtDollars } from "./parse.js";
import type { LiteGame } from "../types.js";

const PRIZES_URL = "https://m.nelottery.com/homeapp/scratch/prizesremaining/web";
const CLOSING_URL = "https://m.nelottery.com/homeapp/scratch/gameclosing";

/**
 * Nebraska Lottery — instant tickets, LITE adapter (top prize only, NO EV).
 *
 * The "Prizes Remaining" mobile page (m.nelottery.com) is server-rendered HTML:
 * each `.gameBlock` holds the ticket price (`.ballDollar`), the game number and
 * name (`.nameBlock`), and a short ladder of the game's TOP prize tiers
 * (`.prizesBlock` → `.prizeDescriptionBlock` amount + `.prizeCountBlock`
 * remaining count).
 *
 * WHY LITE (no EV): Nebraska publishes only the top ~3 prize tiers with their
 * remaining counts — not the full prize ladder and no original/print counts.
 * With the bulk of a scratch game's expected value living in the low/mid tiers
 * that are simply absent here, any EV would be systematically wrong. We expose
 * top-prize + closing-soon data only.
 *
 * closingSoon is driven by Nebraska's dedicated "Game Closings" page (games with
 * an announced closing date) plus any game whose top prize tier is exhausted.
 */

/** Parse "$50,000" / "6,849" / "30" -> number, blanks -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,%\s]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Extract the set of game numbers ("1339") listed on the Game Closings page. */
export function parseNeClosing(html: string): Set<string> {
  const $ = cheerio.load(html);
  const ids = new Set<string>();
  $("table a").each((_, a) => {
    const m = /#(\d{3,5})/.exec($(a).text());
    if (m && m[1]) ids.add(m[1]);
  });
  return ids;
}

export function parseNe(html: string, closingIds: Set<string> = new Set()): LiteGame[] {
  const $ = cheerio.load(html);
  const games: LiteGame[] = [];

  $(".gameBlock").each((_, block) => {
    const $b = $(block);
    const price = num($b.find(".ballDollar").first().text());

    const $name = $b.find(".nameBlock");
    const gameId = ($name.find("span").first().text() || "").replace(/[#\s]/g, "").trim();
    // The name is the second span in the nameBlock (after the "#1357" span).
    const name = $name.find("span").eq(1).text().trim();

    if (!Number.isFinite(price) || !gameId || !name) return;

    // Only the top few tiers are published; pair each amount with its remaining count.
    const amounts: number[] = [];
    const remainByAmount: Array<{ amount: number; remaining: number }> = [];
    $b.find(".prizesBlock").each((__, p) => {
      const amount = num($(p).find(".prizeDescriptionBlock").text());
      const remaining = num($(p).find(".prizeCountBlock").text());
      if (Number.isFinite(amount)) {
        amounts.push(amount);
        remainByAmount.push({ amount, remaining });
      }
    });

    const topPrizeValue = amounts.length > 0 ? Math.max(...amounts) : null;
    const topPrize = topPrizeValue !== null ? fmtDollars(topPrizeValue) : "";

    const topTierGone =
      topPrizeValue !== null &&
      remainByAmount
        .filter((r) => r.amount === topPrizeValue)
        .every((r) => Number.isFinite(r.remaining) && r.remaining === 0);
    const closingSoon = closingIds.has(gameId) || topTierGone;

    games.push({ gameId, name, price, topPrize, topPrizeValue, closingSoon });
  });

  return games;
}

/** Fetch and parse live NE instant-ticket data (LITE: top prize + closing-soon). */
export async function scrapeNe(): Promise<{ source: string; games: LiteGame[] }> {
  const [prizesHtml, closingHtml] = await Promise.all([
    fetchText(PRIZES_URL),
    fetchText(CLOSING_URL).catch(() => ""),
  ]);
  const closingIds = closingHtml ? parseNeClosing(closingHtml) : new Set<string>();
  const games = parseNe(prizesHtml, closingIds);
  if (games.length === 0) {
    throw new Error(
      "NE parser found 0 games — the Prizes Remaining page layout may have changed.",
    );
  }
  return { source: PRIZES_URL, games };
}
