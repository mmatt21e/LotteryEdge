import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const LIST_URL = "https://hoosierlottery.com/games/scratch-off/";
const ORIGIN = "https://hoosierlottery.com";

/** Parse "$30,000" -> 30000, "166,246" -> 166246, "N/A" -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Parse an odds string like "1 in 3.70" -> 3.70. */
function oddsFrom(s: string | undefined): number {
  const m = /1\s*in\s*([\d.,]+)/i.exec(s ?? "");
  return m ? num(m[1]) : NaN;
}

/** Collect the distinct scratch-off game detail slugs from the list page. */
export function parseInList(html: string): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const m = /^\/games\/scratch-off\/([a-z0-9][a-z0-9-]+)\/?$/i.exec(href);
    if (!m) return;
    const slug = m[1]!;
    if (slug === "scratch-off-stats") return;
    seen.add(slug);
  });
  return [...seen];
}

/**
 * Parse a Hoosier Lottery scratch-off detail page.
 *
 * The per-tier prize table (`Prize Amount | Unclaimed | Total Winning Tickets`)
 * carries no per-tier odds, so the whole-game "Estimated Overall Odds" is used
 * as the EV anchor. Meta (game number, price, overall odds) sits in the main
 * `div.game-category-content` block. Note the page's own caveat: the table
 * "may not be inclusive of all prizes in the game."
 */
export function parseInGame(html: string, slug: string): RawGame | null {
  const $ = cheerio.load(html);

  const name = $("h1").first().text().trim();
  if (!name) return null;

  const $meta = $("div.game-category-content").first();
  const scope = $meta.length ? $meta : $("body");
  const metaText = scope.text().replace(/\s+/g, " ");

  const idMatch = /Game #\s*(\d+)/i.exec(metaText);
  const gameId = idMatch ? idMatch[1]! : slug;

  const price = num((/Ticket Price:\s*(\$?[\d,]+)/i.exec(metaText) ?? [])[1]);
  const overallOdds = oddsFrom(
    (/(?:Estimated Overall|Overall) Odds:?\s*(1\s*in\s*[\d.,]+)/i.exec(metaText) ?? [])[1],
  );

  const tiers: PrizeTier[] = [];
  $("table").first().find("tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 3) return; // header row
    const amount = num($(cells[0]).text());
    const remaining = num($(cells[1]).text()); // Unclaimed
    const originalCount = num($(cells[2]).text()); // Total Winning Tickets
    if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) return;
    tiers.push({
      amount,
      originalCount,
      remaining: Number.isFinite(remaining) ? remaining : 0,
    });
  });

  if (tiers.length === 0) return null;

  return {
    state: "in",
    gameId,
    name,
    price: Number.isFinite(price) ? price : NaN,
    url: `${ORIGIN}/games/scratch-off/${slug}/`,
    tiers,
    overallOdds: Number.isFinite(overallOdds) ? overallOdds : undefined,
  };
}

/** Fetch and parse live Indiana (Hoosier) scratch-off data. */
export async function scrapeIn(): Promise<{ source: string; games: RawGame[] }> {
  const listHtml = await fetchText(LIST_URL);
  const slugs = parseInList(listHtml);

  const games: RawGame[] = [];
  for (const slug of slugs) {
    try {
      const html = await fetchText(`${ORIGIN}/games/scratch-off/${slug}/`);
      const game = parseInGame(html, slug);
      if (game) games.push(game);
    } catch {
      // Skip a game whose detail page fails; keep scraping the rest.
    }
  }

  if (games.length === 0) {
    throw new Error(
      "IN parser found 0 games — the list or detail layout may have changed. Inspect the markup.",
    );
  }
  return { source: LIST_URL, games };
}
