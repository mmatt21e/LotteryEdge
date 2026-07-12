import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const LIST_URL = "https://www.molottery.com/scratchers-list.do";
const BASE = "https://www.molottery.com";

/** Parse "$100,000" -> 100000, "463,709" -> 463709, non-numeric -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Parse "1 in 3.04" -> 3.04. */
function overallFromText(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = /1\s*(?::|in)\s*([\d,.]+)/i.exec(s);
  if (!m) return undefined;
  const v = num(m[1]);
  return Number.isFinite(v) ? v : undefined;
}

/** Collect the game detail URLs (one per active game) from the list page. */
export function parseMoList(html: string): { id: string; url: string }[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, string>();
  $("a[href*='scratchers.do']").each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    const m = /scratchers\.do\?method=d&(?:amp;)?game=(\d+)/i.exec(href);
    if (!m || !m[1]) return;
    const id = m[1];
    if (!seen.has(id)) {
      seen.set(id, `${BASE}/scratchers.do?method=d&game=${id}`);
    }
  });
  return [...seen].map(([id, url]) => ({ id, url }));
}

/** Parse a single MO scratchers detail page. */
export function parseMoGame(html: string, id: string, url: string): RawGame | null {
  const $ = cheerio.load(html);

  const name = $(".scratchers-single h1").first().text().trim() || $("h1").last().text().trim();
  if (!name) return null;

  // Info blocks: title/body pairs for Ticket Price, Top Prize, Average Chances*.
  const info: Record<string, string> = {};
  $(".scratchers-single-info__block").each((_, b) => {
    const k = $(b).find(".scratchers-single-info__title").text().trim().replace(/[:*]/g, "").toLowerCase();
    const v = $(b).find(".scratchers-single-info__body").text().trim();
    if (k) info[k] = v;
  });

  const price = num(info["ticket price"]);
  const overallOdds = overallFromText(info["average chances"]);

  // "Estimated Unclaimed Prizes" table: Prize Level / Total Prizes / Unclaimed Prizes.
  let $table: cheerio.Cheerio<any> | null = null;
  $("table.table-mo, table").each((_, t) => {
    const head = $(t).text().toLowerCase();
    if (head.includes("prize level") && head.includes("total prizes") && head.includes("unclaimed")) {
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
    if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) return;
    tiers.push({
      amount,
      originalCount,
      remaining: Number.isFinite(remaining) ? remaining : 0,
    });
  });
  if (tiers.length === 0) return null;

  return {
    state: "mo",
    gameId: id,
    name,
    price: Number.isFinite(price) ? price : NaN,
    url,
    tiers,
    overallOdds,
  };
}

/** Fetch detail pages with bounded concurrency. */
async function fetchGames(entries: { id: string; url: string }[]): Promise<RawGame[]> {
  const out: RawGame[] = [];
  const CONCURRENCY = 8;
  let idx = 0;
  async function worker() {
    while (idx < entries.length) {
      const i = idx++;
      const e = entries[i]!;
      try {
        const html = await fetchText(e.url);
        const g = parseMoGame(html, e.id, e.url);
        if (g) out.push(g);
      } catch {
        // Skip a game whose page failed to load; keep scraping the rest.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
  return out;
}

/** Fetch and parse live Missouri scratch-off data. */
export async function scrapeMo(): Promise<{ source: string; games: RawGame[] }> {
  const list = await fetchText(LIST_URL);
  const entries = parseMoList(list);
  if (entries.length === 0) {
    throw new Error("MO list found 0 game links — the page layout may have changed.");
  }
  const games = await fetchGames(entries);
  if (games.length === 0) {
    throw new Error("MO parser found 0 games — the detail page layout may have changed.");
  }
  return { source: LIST_URL, games };
}
