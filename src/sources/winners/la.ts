import * as cheerio from "cheerio";
import { fetchJson, fetchText, mapPool } from "../http.js";
import { num } from "../parse.js";
import type { WinnerRecord } from "../../types.js";

/**
 * Louisiana posted winners — WordPress REST API with a `winner` post type.
 *
 *   List (scratch-offs only, taxonomy id 61):
 *     /wp-json/wp/v2/winner?winner-games=61&per_page=100&_fields=id,date,slug,link,title
 *   Detail (one fetch per winner — the list JSON has no prize/retailer):
 *     the `link` page, server-rendered with labeled fields:
 *     "DATE CLAIMED: May 26, 2026", "Game: <a .../game/1657-...>$500,000
 *     Extreme Cash</a>", "Amount: $10,000", "Retailer: <a ...>PAL 1972 LLC</a>"
 *
 * Politeness: detail pages are fetched only for winners not already in the
 * accumulated file (knownIds), capped per run. Retailer is the legal entity
 * name; LA doesn't publish the store's city (Hometown is the winner's town).
 */
const LIST_URL =
  "https://louisianalottery.com/wp-json/wp/v2/winner?winner-games=61&per_page=100&_fields=id,date,slug,link,title";

/** Cap of new detail-page fetches per run (backlog drains across runs). */
const MAX_DETAILS_PER_RUN = 40;

interface LaListItem {
  id: number;
  date: string;
  slug: string;
  link: string;
  title: { rendered: string };
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** "May 26, 2026" -> "2026-05-26" (undefined when unparseable). */
export function parseUsDate(s: string | undefined): string | undefined {
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(s ?? "");
  if (!m) return undefined;
  const mm = MONTHS[m[1]!.toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[2]!.padStart(2, "0")}` : undefined;
}

/** Extract one winner from a detail page (null if the labeled fields moved). */
export function parseLaDetail(html: string, item: LaListItem): WinnerRecord | null {
  const $ = cheerio.load(html);
  const text = $("main").text() || $("body").text();

  const amount = num(/Amount:\s*(\$[\d,]+)/.exec(text)?.[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // Game / Retailer are links; take the anchor text following each label.
  const labeled = (label: string): string | undefined => {
    const el = $(`*:contains("${label}")`)
      .filter((_, e) => $(e).children().length <= 2 && $(e).text().trim().startsWith(label))
      .first();
    const a = el.find("a").first().text().trim();
    if (a) return a;
    const raw = el.text().replace(label, "").trim();
    return raw || undefined;
  };

  const game = labeled("Game:");
  const retailer = labeled("Retailer:");
  if (!game || !retailer) return null;

  const gameId = /\/game\/(\d+)-/.exec($(`a[href*="/game/"]`).attr("href") ?? "")?.[1];

  return {
    id: String(item.id),
    game,
    gameId,
    prize: amount,
    retailer,
    player: item.title.rendered.trim() || undefined,
    date: parseUsDate(/DATE CLAIMED:\s*([A-Za-z]+ \d{1,2}, \d{4})/.exec(text)?.[1]) ??
      item.date.slice(0, 10),
    scratch: true, // list is filtered to the scratch-offs taxonomy
  };
}

export async function scrapeLaWinners(
  knownIds: ReadonlySet<string> = new Set(),
): Promise<{ source: string; winners: WinnerRecord[] }> {
  const list = await fetchJson<LaListItem[]>(LIST_URL);
  const fresh = list.filter((it) => !knownIds.has(String(it.id))).slice(0, MAX_DETAILS_PER_RUN);

  const winners = (
    await mapPool(fresh, 4, async (it): Promise<WinnerRecord | null> => {
      try {
        return parseLaDetail(await fetchText(it.link), it);
      } catch {
        return null; // one bad page never blocks the batch
      }
    })
  ).filter((w): w is WinnerRecord => w !== null);

  return { source: LIST_URL, winners };
}
