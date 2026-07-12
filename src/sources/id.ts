import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const BASE = "https://www.idaholottery.com";
const LIST_URL = `${BASE}/games/scratch?view=remaining_prizes`;
const DETAIL_URL = (slug: string) => `${BASE}/games/scratch/${slug}`;

/** Parse "$10,000" -> 10000, "2.00" -> 2, "N/A" -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,%\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

interface ListEntry {
  gameId: string;
  slug: string;
  name: string;
  price: number;
}

/** Parse the scratch list page for game cards (slug, id, name, price). */
export function parseIdList(html: string): ListEntry[] {
  const $ = cheerio.load(html);
  const entries: ListEntry[] = [];
  const seen = new Set<string>();

  $("li.game[data-game-id]").each((_, el) => {
    const $el = $(el);
    const gameId = ($el.attr("data-game-id") ?? "").trim();
    const href = $el.find("a.image-link[href*='/games/scratch/']").first().attr("href") ?? "";
    const slug = (/\/games\/scratch\/([a-z0-9-]+)/i.exec(href) ?? [])[1] ?? "";
    const name = $el.find(".game__title").first().text().trim();
    const price = num($el.find(".game__info-price").first().text());
    if (!gameId || !slug || !name || !Number.isFinite(price)) return;
    if (seen.has(gameId)) return; // cards can repeat (e.g. compare widget)
    seen.add(gameId);
    entries.push({ gameId, slug, name, price });
  });

  return entries;
}

/**
 * Parse a game detail page's "Rules & Odds" table:
 *   Number of Prizes | Prize Amount | Remaining Prizes | Odds ("1:238400")
 * Per-tier odds serve as the EV anchor.
 */
export function parseIdDetail(html: string): PrizeTier[] {
  const $ = cheerio.load(html);
  const tiers: PrizeTier[] = [];

  $("table.full-rules-and-odds tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const originalCount = num($tr.find("td[data-title='Number of Prizes']").text());
    const amount = num($tr.find("td[data-tile='Prize Amount']").text());
    const remaining = num($tr.find("td[data-tile='Remaining Prizes']").text());
    const oddsText = $tr.find("td[data-tile='Odds']").text().trim();
    const oddsMatch = /1\s*[:in]+\s*([\d,.]+)/i.exec(oddsText);
    const odds = oddsMatch ? num(oddsMatch[1]) : NaN;

    if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) return;
    tiers.push({
      amount,
      odds: Number.isFinite(odds) ? odds : undefined,
      originalCount,
      remaining: Number.isFinite(remaining) ? remaining : 0,
    });
  });

  return tiers;
}

/** Run tasks with a small concurrency cap to stay polite. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Fetch and parse live Idaho scratch data (list -> per-game detail). */
export async function scrapeId(): Promise<{ source: string; games: RawGame[] }> {
  const listHtml = await fetchText(LIST_URL);
  const entries = parseIdList(listHtml);

  const games = (
    await mapPool(entries, 6, async (e): Promise<RawGame | null> => {
      const detailHtml = await fetchText(DETAIL_URL(e.slug));
      const tiers = parseIdDetail(detailHtml);
      if (tiers.length === 0) return null;
      return {
        state: "id",
        gameId: e.gameId,
        name: e.name,
        price: e.price,
        url: DETAIL_URL(e.slug),
        tiers,
      };
    })
  ).filter((g): g is RawGame => g !== null);

  if (games.length === 0) {
    throw new Error(
      "ID parser found 0 games — the Idaho scratch list/detail layout may have changed.",
    );
  }
  return { source: LIST_URL, games };
}
