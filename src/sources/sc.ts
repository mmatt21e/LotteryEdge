import * as cheerio from "cheerio";
import { fetchText, mapPool } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const BASE = "https://www.sceducationlottery.com";
const LIST_URL = `${BASE}/Games/PrizesRemaining`;
const DETAIL_URL = (id: string) => `${BASE}/Games/InstantGame?gameId=${id}`;

/** Parse "$1,000,000" -> 1000000, "1,398" -> 1398, "N/A" -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

interface ListEntry {
  gameId: string;
  name: string;
  price: number;
}

/** Parse the PrizesRemaining list, returning only games still available to buy. */
export function parseScList(html: string): ListEntry[] {
  const $ = cheerio.load(html);
  const entries: ListEntry[] = [];

  // Rows carry class "available" or "not-available"; the token selector keeps
  // only the ones still on sale.
  $("tr.available").each((_, el) => {
    const $el = $(el);
    const $a = $el.find("a[href*='InstantGame?gameId=']").first();
    const href = $a.attr("href") ?? "";
    const gameId = (/gameId=(\d+)/.exec(href) ?? [])[1];
    if (!gameId) return;

    const name = $a.find("span").first().text().trim();
    const price = num($el.find("td[data-th='Ticket Price']").first().text());
    if (!name || !Number.isFinite(price)) return;

    entries.push({ gameId, name, price });
  });

  return entries;
}

/**
 * Parse a single InstantGame detail page.
 *
 * The prize table (table.instant-table) has columns:
 *   Prize Amount | Est. Unclaimed Prizes | Est. Value Unclaimed |
 *   Number of Prizes at Start of Game | Value at Start of Game
 * A separate block lists "Overall Odds: 1 in X" which we use as the EV anchor.
 */
export function parseScDetail(html: string): {
  tiers: PrizeTier[];
  overallOdds: number | undefined;
} {
  const $ = cheerio.load(html);
  const tiers: PrizeTier[] = [];

  $("table.instant-table tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("blue-heading")) return; // header row
    const amount = num($tr.find("td[data-th='Prize Amount By Prize Level']").text());
    const remaining = num(
      $tr.find("td[data-th='Estimated Number of Unclaimed Prizes']").text(),
    );
    const originalCount = num(
      $tr.find("td[data-th='Number of Prizes at Start of Game']").text(),
    );
    if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) return;
    tiers.push({
      amount,
      originalCount,
      remaining: Number.isFinite(remaining) ? remaining : 0,
    });
  });

  const bodyText = $("body").text();
  const oddsMatch = /Overall Odds:\s*1 in\s*([\d,.]+)/i.exec(bodyText);
  const overallOdds = oddsMatch ? num(oddsMatch[1]) : undefined;

  return { tiers, overallOdds: Number.isFinite(overallOdds!) ? overallOdds : undefined };
}

/** Fetch and parse live SC scratch-off data (list -> per-game detail). */
export async function scrapeSc(): Promise<{ source: string; games: RawGame[] }> {
  const listHtml = await fetchText(LIST_URL);
  const entries = parseScList(listHtml);

  const games = (
    await mapPool(entries, 6, async (e): Promise<RawGame | null> => {
      const detailHtml = await fetchText(DETAIL_URL(e.gameId));
      const { tiers, overallOdds } = parseScDetail(detailHtml);
      if (tiers.length === 0) return null;
      return {
        state: "sc",
        gameId: e.gameId,
        name: e.name,
        price: e.price,
        url: DETAIL_URL(e.gameId),
        tiers,
        overallOdds,
      };
    })
  ).filter((g): g is RawGame => g !== null);

  if (games.length === 0) {
    throw new Error(
      "SC parser found 0 games — the PrizesRemaining/InstantGame layout may have changed.",
    );
  }
  return { source: LIST_URL, games };
}
