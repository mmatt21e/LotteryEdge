import * as cheerio from "cheerio";
import { fetchText, mapPool } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const HUB_URL = "https://www.mslottery.com/gamestatus/active/";
const BASE = "https://www.mslottery.com";

/** Parse "$100,000" -> 100000, "1,469,394" -> 1469394, non-numeric -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Parse "1:4.08" or "1 in 4.08" -> 4.08. */
function overallFromText(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = /1\s*(?::|in)\s*([\d,.]+)/i.exec(s);
  if (!m) return undefined;
  const v = num(m[1]);
  return Number.isFinite(v) ? v : undefined;
}

/** Collect the active-game detail URLs from the status hub. */
export function parseMsHub(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $("div.gamebox a[href*='instantgames/']").each((_, a) => {
    let href = $(a).attr("href");
    if (!href) return;
    href = href.trim();
    // Keep only real game pages, not the section index.
    const m = /instantgames\/([a-z0-9-]+)\/?/i.exec(href);
    if (!m || !m[1]) return;
    const abs = href.startsWith("http") ? href : `${BASE}${href.startsWith("/") ? "" : "/"}${href}`;
    urls.add(abs.replace(/\/?$/, "/"));
  });
  return [...urls];
}

/** Parse a single MS instant-game detail page. */
export function parseMsGame(html: string, url: string): RawGame | null {
  const $ = cheerio.load(html);

  const name = ($("h1").first().text() || $("title").text().split("-")[0] || "").trim();
  if (!name) return null;

  // "Game Information" table: Ticket Price / Overall Odds / Game Number, etc.
  const info: Record<string, string> = {};
  $("table.juxtable tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length >= 2) {
      const k = $(tds[0]).text().trim().toLowerCase();
      info[k] = $(tds[1]).text().trim();
    }
  });

  const price = num(info["ticket price"]);
  const overallOdds = overallFromText(info["overall odds"]);
  const slugId = /instantgames\/([a-z0-9-]+)/i.exec(url)?.[1] ?? "";
  const gameId = num(info["game number"]) > 0 ? String(num(info["game number"])) : slugId;
  if (!gameId) return null;

  // Prize table: headers "Prize Value / Original Prize Count / Remaining Prize Count".
  let $table: cheerio.Cheerio<any> | null = null;
  $("table").each((_, t) => {
    const head = $(t).text().toLowerCase();
    if (
      head.includes("prize value") &&
      head.includes("original prize count") &&
      head.includes("remaining prize count")
    ) {
      $table = $(t);
      return false; // break
    }
  });
  if (!$table) return null;

  const tiers: PrizeTier[] = [];
  ($table as cheerio.Cheerio<any>).find("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 3) return;
    const amount = num($(cells[0]).text());
    const originalCount = num($(cells[1]).text());
    const remaining = num($(cells[2]).text());
    // Skip non-numeric rows such as "2nd Chance Prize".
    if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) return;
    tiers.push({
      amount,
      originalCount,
      remaining: Number.isFinite(remaining) ? remaining : 0,
    });
  });
  if (tiers.length === 0) return null;

  // A game without a readable price can't be ranked — drop it rather than
  // publish price:null (which would flow to a silent roi 0).
  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    state: "ms",
    gameId,
    name,
    price,
    url,
    tiers,
    overallOdds,
  };
}

/** Fetch detail pages with bounded concurrency; failures are counted, not hidden. */
async function fetchGames(urls: string[]): Promise<RawGame[]> {
  let failed = 0;
  const results = await mapPool(urls, 8, async (u): Promise<RawGame | null> => {
    try {
      const html = await fetchText(u);
      return parseMsGame(html, u);
    } catch {
      failed++;
      return null;
    }
  });
  if (failed > 0) console.warn(`[ms] ${failed}/${urls.length} game pages failed or were skipped`);
  return results.filter((g): g is RawGame => g !== null);
}

/** Fetch and parse live Mississippi scratch-off data. */
export async function scrapeMs(): Promise<{ source: string; games: RawGame[] }> {
  const hub = await fetchText(HUB_URL);
  const urls = parseMsHub(hub);
  if (urls.length === 0) {
    throw new Error("MS hub found 0 game links — the page layout may have changed.");
  }
  const games = await fetchGames(urls);
  if (games.length === 0) {
    throw new Error("MS parser found 0 games — the detail page layout may have changed.");
  }
  return { source: HUB_URL, games };
}
