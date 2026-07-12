import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const REMAIN_URL = "https://www.kylottery.com/apps/scratch_offs/prizes_remaining.html";
const LIST_URL = "https://www.kylottery.com/apps/scratch_offs/available_games.html";
const ORIGIN = "https://www.kylottery.com";

/**
 * Smallest estimated remaining ticket pool (Σ prizes remaining × overall odds)
 * for a game to be trusted. Kentucky publishes no original counts, so the EV
 * engine treats the remaining prizes as the whole pool (fractionRemaining ≡ 1)
 * and estimates tickets left as Σremaining × overallOdds — a sound current-pool
 * EV. But once a game is nearly sold out (only a few thousand winners left) a
 * single unclaimed jackpot dominates and blows the per-ticket EV up. Below this
 * floor the game is effectively gone; we drop it rather than publish an artifact.
 */
const MIN_REMAINING_POOL = 20_000;

/** Parse "$862,000" -> 862000, " 1" -> 1, "N/A" -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Polite pause between the per-game detail fetches. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch with one retry, so a transient blip does not silently drop a game. */
async function fetchRetry(url: string): Promise<string> {
  try {
    return await fetchText(url);
  } catch {
    await sleep(500);
    return await fetchText(url);
  }
}

/** Normalized name key (alphanumerics only, trailing game number dropped). */
function nameKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/\d+$/, "");
}

interface Panel {
  name: string;
  gameId: string | null;
  tiers: { amount: number; remaining: number }[];
}

/**
 * Parse the Kentucky "Prizes Remaining" page.
 *
 * One accordion panel per game; the title is "<Name> - <GameNumber>" (a few
 * legacy games omit the number). Each panel holds a two-column table:
 *   Prize Amount | Prizes Remaining
 * The page publishes no original counts and no odds — both the ticket price and
 * the overall odds anchor come from the per-game detail page.
 */
export function parseKyPanels(html: string): Panel[] {
  const $ = cheerio.load(html);
  const panels: Panel[] = [];

  $("div.panel.panel-info").each((_, el) => {
    const $el = $(el);
    const title = $el.find(".panel-title").first().text().trim();
    if (!title) return;
    const m = /^(.*?)\s*-\s*(\d+)\s*$/.exec(title);
    const name = m ? m[1]!.trim() : title;
    const gameId = m ? m[2]! : null;

    const tiers: { amount: number; remaining: number }[] = [];
    $el.find("tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length !== 2) return;
      const amount = num($(tds[0]).text());
      const remaining = num($(tds[1]).text());
      if (!Number.isFinite(amount) || !Number.isFinite(remaining)) return;
      tiers.push({ amount, remaining });
    });
    if (tiers.length === 0) return;

    panels.push({ name, gameId, tiers });
  });

  return panels;
}

/**
 * Detail-page paths are emitted into a JS array (`tl.push("/apps/.../games/X")`),
 * not as anchors, so we pull them straight from the page text. Returns lookups
 * by trailing game number and by normalized name.
 */
export function parseKyGamePaths(listHtml: string): {
  byNum: Map<string, string>;
  byName: Map<string, string>;
} {
  const byNum = new Map<string, string>();
  const byName = new Map<string, string>();
  const re = /"(\/apps\/scratch_offs\/games\/[^"]+)"/g;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(listHtml)) !== null) {
    const path = match[1]!;
    if (seen.has(path)) continue;
    seen.add(path);
    const base = path.replace(/\/+$/, "").split("/").pop()!;
    const numMatch = /(\d+)$/.exec(base);
    if (numMatch && !byNum.has(numMatch[1]!)) byNum.set(numMatch[1]!, path);
    const nk = nameKey(base);
    if (nk && !byName.has(nk)) byName.set(nk, path);
  }
  return { byNum, byName };
}

/** Ticket price, overall odds ("1:X" -> X) and game number from a detail page. */
export function parseKyDetail(html: string): {
  price: number;
  overallOdds?: number;
  gameId?: string;
} {
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ");
  const price = num(/Value:\s*\$([\d,]+)/.exec(text)?.[1]);
  const oddsMatch = /Overall Odds:\s*1\s*:\s*([\d.,]+)/i.exec(text);
  const overallOdds = oddsMatch ? num(oddsMatch[1]) : undefined;
  const gameId = /Game #:\s*(\d+)/.exec(text)?.[1];
  return {
    price,
    overallOdds: Number.isFinite(overallOdds!) ? overallOdds : undefined,
    gameId,
  };
}

/**
 * Fetch and parse live Kentucky scratch-off data.
 *
 * Prizes Remaining supplies the game list and per-tier remaining counts; each
 * game's detail page supplies the ticket price and overall-odds anchor. Kentucky
 * does not publish original per-tier counts, so `originalCount` is set to the
 * remaining count (a lower bound); the overall-odds anchor still lets EV
 * estimate the current ticket pool.
 */
export async function scrapeKy(): Promise<{ source: string; games: RawGame[] }> {
  const [remainHtml, listHtml] = await Promise.all([
    fetchText(REMAIN_URL),
    fetchText(LIST_URL),
  ]);
  const panels = parseKyPanels(remainHtml);
  if (panels.length === 0) {
    throw new Error(
      "Kentucky parser found 0 games on the Prizes Remaining page — layout may have changed.",
    );
  }
  const { byNum, byName } = parseKyGamePaths(listHtml);

  const games: RawGame[] = [];
  for (const p of panels) {
    const path =
      (p.gameId ? byNum.get(p.gameId) : undefined) ?? byName.get(nameKey(p.name));
    if (!path) continue; // no detail page -> no price/odds anchor

    const url = `${ORIGIN}${path}`;
    let detail: { price: number; overallOdds?: number; gameId?: string } = {
      price: NaN,
    };
    try {
      detail = parseKyDetail(await fetchRetry(url));
      await sleep(120);
    } catch {
      continue; // detail unavailable -> skip (no anchor)
    }

    const gameId = p.gameId ?? detail.gameId;
    if (!gameId) continue;

    const tiers: PrizeTier[] = p.tiers.map((t) => ({
      amount: t.amount,
      originalCount: t.remaining, // KY publishes no original counts
      remaining: t.remaining,
    }));

    // Drop effectively sold-out games: with no original counts the EV engine
    // estimates tickets remaining as Σremaining × overallOdds; below the floor
    // the game is nearly gone and a lone unclaimed jackpot detonates its EV.
    const remTotal = tiers.reduce((s, t) => s + t.remaining, 0);
    if (detail.overallOdds && remTotal * detail.overallOdds < MIN_REMAINING_POOL) {
      continue;
    }

    games.push({
      state: "ky",
      gameId,
      name: p.name,
      price: detail.price,
      url,
      tiers,
      overallOdds: detail.overallOdds,
    });
  }

  if (games.length === 0) {
    throw new Error(
      "Kentucky parser resolved 0 games with a usable detail page — layout may have changed.",
    );
  }

  return { source: REMAIN_URL, games };
}
