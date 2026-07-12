import * as cheerio from "cheerio";
import type { RawGame, PrizeTier } from "../types.js";

/**
 * California Lottery — Scratchers.
 *
 * Two-step source:
 *  1. List JSON (all active games, with overall odds + top prize):
 *       https://www.calottery.com/api/Sitecore/ScratchersFilteredList/GetScratchers?size=999
 *     Each card: { GameNumber, GameName, MarketingTitle, GamePrice ("$20"),
 *       OverallOdds ("2.89"), TopPrizeDollarAmt, GameProductPage }
 *     The list has NO per-tier remaining data.
 *  2. Per-game detail page (server-rendered HTML — no browser needed):
 *       https://www.calottery.com<GameProductPage>
 *     contains a `.odds-available-prizes__table` with one row per tier:
 *       [ Prize "$5,000,000" | Odds "1 in" "2,400,000" | "7 of 7" (remaining of original) ]
 *     giving amount, per-tier odds, remaining, and originalCount.
 *
 * EV ANCHOR: game.overallOdds (from the list) AND per-tier `odds` (from the
 * detail table) — both real, no fabrication. The detail pages are fully
 * server-rendered, so CA does NOT need Wave-2/Playwright.
 */
const BASE = "https://www.calottery.com";
const LIST_URL = `${BASE}/api/Sitecore/ScratchersFilteredList/GetScratchers?size=999`;
/** How many detail pages to fetch at once. Polite, not hammering. */
const CONCURRENCY = 6;

interface CaCard {
  GameNumber: number;
  GameName: string;
  MarketingTitle: string;
  GamePrice: string; // "$20"
  OverallOdds: string; // "2.89"
  TopPrizeDollarAmt: string; // "$5,000,000"
  GameProductPage: string; // "/scratchers/$20/golden-state-riches-1735"
}

interface CaList {
  TotalScratcherCards: number;
  SerializedScratcherCardList: CaCard[];
}

/** "$1,000,000" -> 1000000, "2.89" -> 2.89, "N/A" -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

async function fetchJson<T>(url: string, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LotteryEdge/0.1 (personal scratch-off EV tool)",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, timeoutMs = 30_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LotteryEdge/0.1 (personal scratch-off EV tool)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Parse the `.odds-available-prizes__table` on a CA detail page into tiers. */
export function parseCaTiers(html: string): PrizeTier[] {
  const $ = cheerio.load(html);
  const tiers: PrizeTier[] = [];

  $(".odds-available-prizes__table tr.odds-available-prizes__table__body").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 3) return;

    const amount = num($(tds[0]).text());
    const odds = num($(tds[1]).text());

    // Third cell is "<remaining> of <original>", e.g. "414 of 422".
    const remCell = $(tds[2]).text();
    const nums = (remCell.match(/[\d,]+/g) ?? []).map((x) => num(x));
    const remaining = nums.length >= 1 ? nums[0]! : NaN;
    const originalCount = nums.length >= 2 ? nums[1]! : NaN;

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

/** Run an async mapper over items with bounded concurrency. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Fetch and parse live CA Scratchers data (list + per-game detail tiers). */
export async function scrapeCa(): Promise<{ source: string; games: RawGame[] }> {
  const list = await fetchJson<CaList>(LIST_URL);
  const cards = list.SerializedScratcherCardList ?? [];

  const built = await mapLimit(cards, CONCURRENCY, async (c): Promise<RawGame | null> => {
    const gameId = String(c.GameNumber);
    const name = (c.MarketingTitle || c.GameName || "").trim();
    const price = num(c.GamePrice);
    const overallOdds = num(c.OverallOdds);
    if (!gameId || !name || !Number.isFinite(price)) return null;

    const url = c.GameProductPage ? `${BASE}${c.GameProductPage}` : undefined;
    let tiers: PrizeTier[] = [];
    if (url) {
      try {
        const html = await fetchText(url);
        tiers = parseCaTiers(html);
      } catch {
        tiers = [];
      }
    }
    if (tiers.length === 0) return null;

    return {
      state: "ca",
      gameId,
      name,
      price,
      url,
      tiers,
      overallOdds: Number.isFinite(overallOdds) ? overallOdds : undefined,
    };
  });

  const games = built.filter((g): g is RawGame => g !== null);
  if (games.length === 0) {
    throw new Error(
      "CA parser found 0 games — the list API or detail-page prize table layout may have changed.",
    );
  }
  return { source: LIST_URL, games };
}
