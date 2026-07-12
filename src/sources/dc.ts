import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { LiteGame } from "../types.js";

/**
 * Washington DC Lottery — scratchers, LITE adapter (top prize only, NO EV).
 *
 * Source: the DC Lottery scratchers landing page, a Drupal-rendered static HTML
 * listing. Each active game is an <article class="node--game-scratchers…">
 * card carrying:
 *   .field--name-field-price          -> "$20"
 *   .field_game_number .field__item   -> "1667"
 *   .field--name-title                -> game name
 *   .field--name-field-top-prize .field__item[content] -> top prize ($ + numeric)
 *
 * WHY LITE (no EV): the public listing publishes only the game's price, single
 * TOP prize, and an overall "1:X" odds figure — not the per-tier prize ladder or
 * remaining/original prize counts. There is nothing to compute a per-ticket
 * expected value from, so we expose the game list + top prize only.
 *
 * NOTE: this listing carries no sell-through or end-date signal, so
 * `closingSoon` is false for every game.
 */

const SCRATCHERS_URL = "https://dclottery.com/dc-scratchers";

/** Parse "$250,000" / "$20" -> number, blanks/garbage -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

export function parseDc(html: string): LiteGame[] {
  const $ = cheerio.load(html);
  const games: LiteGame[] = [];
  const seen = new Set<string>();

  // Only the listing cards ("colored-squares" view mode) carry a game number
  // and price; the "featured" duplicates omit both, so keying on the game
  // number naturally selects the full cards and de-dupes.
  $("article.node--type-game-scratchers").each((_, el) => {
    const $el = $(el);

    const gameId = $el.find(".field_game_number .field__item").first().text().trim();
    if (!gameId || seen.has(gameId)) return;

    const price = num($el.find(".field--name-field-price").first().text());
    const name = $el.find(".field--name-title").first().text().trim();

    const $prize = $el.find(".field--name-field-top-prize .field__item").first();
    // The Drupal integer field exposes the raw value in a `content` attribute;
    // fall back to parsing the displayed "$250,000" text.
    const contentAttr = $prize.attr("content");
    const prizeText = $prize.text().trim();
    const topPrizeValue = Number.isFinite(num(contentAttr))
      ? num(contentAttr)
      : Number.isFinite(num(prizeText))
        ? num(prizeText)
        : null;

    if (!name || !Number.isFinite(price)) return;

    seen.add(gameId);
    games.push({
      gameId,
      name,
      price,
      topPrize: prizeText || (topPrizeValue !== null ? "$" + topPrizeValue.toLocaleString("en-US") : ""),
      topPrizeValue,
      // Listing exposes no closing / end-date signal.
      closingSoon: false,
    });
  });

  return games;
}

/** Fetch and parse live DC scratcher data (LITE: top prize + price). */
export async function scrapeDc(): Promise<{ source: string; games: LiteGame[] }> {
  const html = await fetchText(SCRATCHERS_URL);
  const games = parseDc(html);
  if (games.length === 0) {
    throw new Error(
      "DC parser found 0 games — the scratchers listing markup may have changed.",
    );
  }
  return { source: SCRATCHERS_URL, games };
}
