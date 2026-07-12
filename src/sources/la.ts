import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const LIST_URL = "https://louisianalottery.com/scratch-offs/";
const ORIGIN = "https://louisianalottery.com";

/** Parse "$500,000" -> 500000, "5,855" -> 5855, "N/A" -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Parse an odds string like "1 in 240,650.00" or "1 in 3.26" -> 240650 / 3.26. */
function oddsFrom(s: string | undefined): number {
  const m = /1\s*in\s*([\d.,]+)/i.exec(s ?? "");
  return m ? num(m[1]) : NaN;
}

/** Collect the distinct /game/{number}-{slug}/ detail URLs from the list page. */
export function parseLaList(html: string): { gameId: string; url: string }[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, string>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const m = /\/game\/(\d+)-[a-z0-9-]+\/?/i.exec(href);
    if (!m) return;
    const gameId = m[1]!;
    const url = href.startsWith("http") ? href : `${ORIGIN}${m[0]}`;
    if (!seen.has(gameId)) seen.set(gameId, url);
  });
  return [...seen.entries()].map(([gameId, url]) => ({ gameId, url }));
}

/**
 * Parse a Louisiana scratch-off detail page.
 *
 * Main game meta lives in a small list of `<span><em>VALUE</em>LABEL</span>`
 * items (Ticket Price / Top Prize / Overall Odds). The prize table
 * (`table.table`) has one row per tier:
 *   Tier Prize | Odds of Winning | Total | Claimed | Remaining
 */
export function parseLaGame(html: string, gameId: string, url: string): RawGame | null {
  const $ = cheerio.load(html);

  const name = $("h1").first().text().trim();
  if (!name) return null;

  // Read the main-game meta block: first `<em>` value per label.
  const meta = new Map<string, string>();
  $("span:has(em)").each((_, span) => {
    const $span = $(span);
    const value = $span.find("em").first().text().trim();
    const label = $span.clone().children().remove().end().text().trim();
    if (label && !meta.has(label)) meta.set(label, value);
  });

  const price = num(meta.get("Ticket Price"));
  const overallOdds = oddsFrom(meta.get("Overall Odds"));

  const tiers: PrizeTier[] = [];
  $("table.table").first().find("tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 5) return; // header or "Last Updated" footnote row
    const amount = num($(cells[0]).text());
    const odds = oddsFrom($(cells[1]).text());
    const originalCount = num($(cells[2]).text());
    const remaining = num($(cells[4]).text());
    if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) return;
    tiers.push({
      amount,
      odds: Number.isFinite(odds) ? odds : undefined,
      originalCount,
      remaining: Number.isFinite(remaining) ? remaining : 0,
    });
  });

  if (tiers.length === 0) return null;

  return {
    state: "la",
    gameId,
    name,
    price: Number.isFinite(price) ? price : NaN,
    url,
    tiers,
    overallOdds: Number.isFinite(overallOdds) ? overallOdds : undefined,
  };
}

/** Fetch and parse live Louisiana scratch-off data. */
export async function scrapeLa(): Promise<{ source: string; games: RawGame[] }> {
  const listHtml = await fetchText(LIST_URL);
  const entries = parseLaList(listHtml);

  const games: RawGame[] = [];
  for (const { gameId, url } of entries) {
    try {
      const html = await fetchText(url);
      const game = parseLaGame(html, gameId, url);
      if (game) games.push(game);
    } catch {
      // Skip a game whose detail page fails; keep scraping the rest.
    }
  }

  if (games.length === 0) {
    throw new Error(
      "LA parser found 0 games — the list or detail layout may have changed. Inspect the markup.",
    );
  }
  return { source: LIST_URL, games };
}
