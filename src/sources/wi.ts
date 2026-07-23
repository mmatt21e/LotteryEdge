import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import { fmtDollars } from "./parse.js";
import type { LiteGame } from "../types.js";

const LIST_URL = "https://wilottery.com/games/instant-games/scratch-games";

/**
 * Wisconsin Lottery — instant (scratch) games, LITE adapter (top prize +
 * closing-soon, NO EV).
 *
 * The scratch-games listing page renders every game as a card that already
 * carries all the LITE fields, so no per-game page fetch is needed:
 *   - container `.js__instant_listing_item[data-type="scratch"]` with
 *     data-price / data-starti / data-endi attributes,
 *   - a link `/games/instant-games/<slug-gamenumber>` (game number = slug tail),
 *   - a `.card` whose title attribute is "<NAME> Scratch Game",
 *   - a `.top-prize-amount` div "Top Prize $X!".
 *
 * WHY LITE (no EV): the listing (and the individual game pages) publish only the
 * TOP prize and the whole-game overall odds — never the full prize ladder with
 * per-tier counts. There is no basis for an expected-value estimate.
 *
 * closingSoon mirrors Wisconsin's own "Expiring Soon" flag. Their listing JS
 * (themes/custom/wilottery/js/main.min.js) classifies each card as:
 *   new  if starti > now - 14d
 *   hist if now >= endi + 180d      (expired long ago -> excluded from the list)
 *   exp  if endi < now              ("Expiring Soon")
 *   else current
 * We replicate that: drop `hist` games and set closingSoon on `exp` games.
 */

const DAY = 86_400;
const NEW_WINDOW = 14 * DAY;
const HIST_WINDOW = 180 * DAY; // 15552000, matching the site's 15552e3.

export function parseWi(html: string, nowSec: number = Math.floor(Date.now() / 1000)): LiteGame[] {
  const $ = cheerio.load(html);
  const games: LiteGame[] = [];

  $(".js__instant_listing_item[data-type='scratch']").each((_, el) => {
    const $el = $(el);

    const price = Number($el.attr("data-price"));
    const starti = parseInt($el.attr("data-starti") ?? "", 10);
    const endi = parseInt($el.attr("data-endi") ?? "", 10);

    const href = $el.find("a[href*='/games/instant-games/']").first().attr("href") ?? "";
    const slug = href.split("/").filter(Boolean).pop() ?? "";
    // Game number is the trailing "-1234" of the slug; fall back to the slug.
    const idMatch = slug.match(/-(\d+)$/);
    const gameId = idMatch ? idMatch[1] : slug;

    const title = $el.find(".card").first().attr("title") ?? "";
    const name = title.replace(/\s*Scratch Game\s*$/i, "").trim();

    if (!Number.isFinite(price) || !gameId || !name) return;

    // Replicate the site's flag classification.
    let flag = "current";
    if (Number.isFinite(starti) && starti > nowSec - NEW_WINDOW) flag = "new";
    else if (Number.isFinite(endi) && nowSec >= endi + HIST_WINDOW) flag = "hist";
    else if (Number.isFinite(endi) && endi < nowSec) flag = "exp";
    if (flag === "hist") return; // expired long ago — not a listed game.

    const topText = $el.find(".top-prize-amount").first().text();
    const topMatch = topText.match(/\$\s*([\d,]+(?:\.\d+)?)/);
    const topPrizeValue = topMatch?.[1] ? Number(topMatch[1].replace(/,/g, "")) : null;
    const topPrize = topPrizeValue !== null ? fmtDollars(topPrizeValue) : "";

    games.push({
      gameId,
      name,
      price,
      topPrize,
      topPrizeValue,
      closingSoon: flag === "exp",
    });
  });

  return games;
}

/** Fetch and parse live WI scratch-game data (LITE: top prize + closing-soon). */
export async function scrapeWi(): Promise<{ source: string; games: LiteGame[] }> {
  const html = await fetchText(LIST_URL);
  const games = parseWi(html);
  if (games.length === 0) {
    throw new Error(
      "WI parser found 0 games — the instant-games listing layout may have changed.",
    );
  }
  return { source: LIST_URL, games };
}
