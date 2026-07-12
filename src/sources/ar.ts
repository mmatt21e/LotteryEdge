import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const BASE = "https://www.myarkansaslottery.com";
const LIST_URL = `${BASE}/games/instant`;

/** Extract the first numeric value from a string, tolerating "$", commas and
 *  trailing words ("$2,000,000 ANNUITY" -> 2000000, "77,777.00" -> 77777). */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const m = /-?[\d,]+(?:\.\d+)?/.exec(s);
  if (!m) return NaN;
  const v = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(v) ? v : NaN;
}

/** Collect instant-game detail URLs from every page of the list. */
async function collectGameUrls(): Promise<string[]> {
  const urls = new Set<string>();
  for (let page = 0; page < 30; page++) {
    const url = page === 0 ? LIST_URL : `${LIST_URL}?page=${page}`;
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const before = urls.size;
    $("article.node-instant-game a[href^='/games/']").each((_, a) => {
      const href = $(a).attr("href");
      if (href) urls.add(`${BASE}${href}`);
    });
    if (urls.size === before) break; // empty page -> past the end
  }
  return [...urls];
}

/**
 * Parse an Arkansas instant-game detail page.
 *
 * Server-rendered (Drupal). Relevant fields:
 *   .field-name-field-game-number   -> "894"
 *   h1.layout-center                -> game name
 *   .field-name-field-ticket-price  -> "$5"
 *   .field-name-field-game-odds     -> "1 in 3.63"  (overall odds)
 *   table.table-instant-game-data   -> one row per tier, 5 cells:
 *     [0] Tier Prize Description  (amount)
 *     [1] Total Prizes in Game    (originalCount)
 *     [2] Estimated Prizes Remaining (remaining)
 *     [3] Total Prize Amount
 *     [4] Estimated Prize Amount Remaining
 */
export function parseArGame(html: string, url: string): RawGame | null {
  const $ = cheerio.load(html);

  const gameId = $(".field-name-field-game-number .field-item").first().text().trim();
  const name = $("h1.layout-center").first().text().trim() ||
    $(".field-name-title-field .field-item").first().text().trim();
  const price = num($(".field-name-field-ticket-price .field-item").first().text());
  const oddsText = $(".field-name-field-game-odds .field-item").first().text();
  const overallOddsMatch = /1\s*in\s*([\d.,]+)/i.exec(oddsText);
  const overallOdds = overallOddsMatch ? num(overallOddsMatch[1]) : NaN;

  if (!gameId || !name || !Number.isFinite(price)) return null;

  const tiers: PrizeTier[] = [];
  $("table.table-instant-game-data tbody tr").each((_, tr) => {
    const cells = $(tr).find("td").map((_, td) => $(td).text().trim()).get();
    if (cells.length < 3) return;
    const amount = num(cells[0]);
    const originalCount = num(cells[1]);
    const remaining = num(cells[2]);
    if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) return;
    tiers.push({
      amount,
      originalCount,
      remaining: Number.isFinite(remaining) ? remaining : 0,
    });
  });

  if (tiers.length === 0) return null;
  // EV anchor required: overall odds (present for essentially every game).
  if (!Number.isFinite(overallOdds)) return null;

  return {
    state: "ar",
    gameId,
    name,
    price,
    url,
    tiers,
    overallOdds,
  };
}

/** Fetch and parse live Arkansas instant-game data. */
export async function scrapeAr(): Promise<{ source: string; games: RawGame[] }> {
  const urls = await collectGameUrls();
  const games: RawGame[] = [];
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const game = parseArGame(html, url);
      if (game) games.push(game);
    } catch {
      // Skip a single unreachable detail page rather than fail the whole scrape.
    }
  }
  if (games.length === 0) {
    throw new Error(
      "AR parser found 0 games — the list or detail layout may have changed. Inspect the markup.",
    );
  }
  return { source: LIST_URL, games };
}
