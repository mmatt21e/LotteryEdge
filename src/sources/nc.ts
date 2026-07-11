import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const PRIZES_URL = "https://nclottery.com/scratch-off-prizes-remaining";

/** Parse "$1,000,000" -> 1000000, "1,469,394" -> 1469394, "N/A" -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Read the ticket price from the game container class, e.g. "price_5" -> 5. */
function priceFromClass(cls: string | undefined): number {
  const m = /price_(\d+)/.exec(cls ?? "");
  return m ? Number(m[1]) : NaN;
}

/**
 * Parse the NC "Prizes Remaining" page.
 *
 * Structure (server-rendered, ASP.NET):
 *   div.databox.price_N                       <- one per game, price in the class
 *     .gamename a[href="/scratch-off/996/..."]  <- name + game id
 *     .gamenumber                               <- "Game Number: 996"
 *     rows of 4 spans:
 *       .PrizeValue .OriginalOdds .PrizeCount .PrizeCountRemaining
 */
export function parseNc(html: string): RawGame[] {
  const $ = cheerio.load(html);
  const games: RawGame[] = [];

  $("div.databox").each((_, el) => {
    const $el = $(el);
    const price = priceFromClass($el.attr("class"));
    if (!Number.isFinite(price)) return; // not a game box

    const $name = $el.find(".gamename a").first();
    const name = $name.text().trim();
    const href = $name.attr("href") ?? "";
    const idMatch = /\/scratch-off\/(\d+)/.exec(href);
    const gameId = idMatch ? idMatch[1]! : $el.find(".gamenumber").text().replace(/\D/g, "");
    if (!name || !gameId) return;

    // Each tier contributes four parallel spans. Zip them by index.
    const values = $el.find(".PrizeValue").map((_, s) => num($(s).text())).get();
    const odds = $el.find(".OriginalOdds").map((_, s) => num($(s).text())).get();
    const counts = $el.find(".PrizeCount").map((_, s) => num($(s).text())).get();
    const remaining = $el.find(".PrizeCountRemaining").map((_, s) => num($(s).text())).get();

    const tiers: PrizeTier[] = [];
    for (let i = 0; i < values.length; i++) {
      const amount = values[i];
      const originalCount = counts[i];
      const rem = remaining[i];
      if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) continue;
      tiers.push({
        amount: amount!,
        odds: Number.isFinite(odds[i]) ? odds[i]! : undefined,
        originalCount: originalCount!,
        remaining: Number.isFinite(rem) ? rem! : 0,
      });
    }
    if (tiers.length === 0) return;

    games.push({
      state: "nc",
      gameId: gameId!,
      name,
      price,
      url: href ? `https://nclottery.com${href}` : undefined,
      tiers,
    });
  });

  return games;
}

/** Fetch and parse live NC scratch-off data. */
export async function scrapeNc(): Promise<{ source: string; games: RawGame[] }> {
  const html = await fetchText(PRIZES_URL);
  const games = parseNc(html);
  if (games.length === 0) {
    throw new Error(
      "NC parser found 0 games — the page layout may have changed. Inspect the markup.",
    );
  }
  return { source: PRIZES_URL, games };
}
