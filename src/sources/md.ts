import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

/** Public list page (human-facing). */
const LIST_URL = "https://www.mdlottery.com/games/scratch-offs/";

/**
 * The list page renders its games client-side via a WordPress AJAX shortcode.
 * This GET returns the fully-rendered <li class="ticket"> markup for every
 * active scratch-off, including the per-game "Prize Amount / Start / Remaining"
 * table — so no per-game detail fetches are needed.
 */
const AJAX_URL =
  "https://www.mdlottery.com/wp-admin/admin-ajax.php" +
  "?action=jquery_shortcode&shortcode=scratch_offs&atts=%7B%22null%22%3A%22null%22%7D";

/** Parse "$1,000,000" -> 1000000, "18,893" -> 18893, "N/A" -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/**
 * Parse the Maryland scratch-off AJAX markup.
 *
 * Each game is one <li class="ticket" id="ticket_806">:
 *   .price                 "$10"
 *   .name                  "Win $50, $100 or $200"
 *   .gamenumber            "Game #806"
 *   .probability           "9.10"  (overall odds = 1 in 9.10)
 *   .prize-details table   rows of  Prize Amount | Start | Remaining
 * "Start" is the original print count; "Remaining" is unclaimed.
 */
export function parseMd(html: string): RawGame[] {
  const $ = cheerio.load(html);
  const games: RawGame[] = [];

  $("li.ticket").each((_, el) => {
    const $el = $(el);

    const idAttr = $el.attr("id") ?? "";
    const gameId =
      /ticket_(\d+)/.exec(idAttr)?.[1] ??
      $el.find(".gamenumber").text().replace(/\D/g, "");
    const name = $el.find(".name").first().text().trim();
    const price = num($el.find(".price").first().text());
    if (!gameId || !name || !Number.isFinite(price)) return;

    // Overall odds ("1 in X"): use as the whole-game EV anchor.
    const overallOdds = num($el.find(".probability").first().text());

    const tiers: PrizeTier[] = [];
    $el.find(".prize-details table tbody tr").each((_, tr) => {
      const cells = $(tr)
        .find("td")
        .map((_, td) => $(td).text().trim())
        .get();
      if (cells.length < 3) return;
      const amount = num(cells[0]);
      const originalCount = num(cells[1]); // "Start"
      const remaining = num(cells[2]);
      if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) return;
      tiers.push({
        amount,
        originalCount,
        remaining: Number.isFinite(remaining) ? remaining : 0,
      });
    });
    if (tiers.length === 0) return;

    games.push({
      state: "md",
      gameId,
      name,
      price,
      url: LIST_URL,
      tiers,
      overallOdds: Number.isFinite(overallOdds) ? overallOdds : undefined,
    });
  });

  return games;
}

/** Fetch and parse live Maryland scratch-off data. */
export async function scrapeMd(): Promise<{ source: string; games: RawGame[] }> {
  const html = await fetchText(AJAX_URL);
  const games = parseMd(html);
  if (games.length === 0) {
    throw new Error(
      "MD parser found 0 games — the AJAX shortcode markup may have changed. Inspect the response.",
    );
  }
  return { source: LIST_URL, games };
}
