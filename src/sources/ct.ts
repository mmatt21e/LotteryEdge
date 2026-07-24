import * as cheerio from "cheerio";
import { fetchText, UA } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const BASE = "https://www.ctlottery.org";
const LIST_URL = `${BASE}/scratchgames`;

/**
 * The game list and per-game detail are served by AJAX endpoints that reject
 * requests without a same-site Referer. `fetchText` (used for the landing page)
 * cannot set custom headers, so these calls use a thin local fetch that adds the
 * Referer the server requires. Behaviour is otherwise identical to fetchText.
 */
async function fetchAjax(url: string, timeoutMs = 30_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        Referer: LIST_URL,
      },
    });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Extract the first numeric value from a string ("$2,000,000 ANNUITY" -> 2000000). */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const m = /-?[\d,]+(?:\.\d+)?/.exec(s);
  if (!m) return NaN;
  const v = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(v) ? v : NaN;
}

/** Walk the "All" tab of the AJAX list, page by page, collecting game numbers. */
async function collectGameIds(): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let page = 1; page < 40; page++) {
    const url = `${BASE}/ajax/getScratchGamePage?s=GameStart&t=All&p=${page}&f=`;
    const html = await fetchAjax(url);
    const $ = cheerio.load(html);
    let found = 0;
    $("[onclick^='DisplayGameFromPage']").each((_, el) => {
      const m = /DisplayGameFromPage\((\d+)\)/.exec($(el).attr("onclick") ?? "");
      if (!m) return;
      const id = m[1]!;
      found++;
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    });
    if (found === 0) break; // past the last page
  }
  return ids;
}

/**
 * Parse a Connecticut scratch-game detail fragment (getScratchGameDetail).
 *
 * Info table (label/value rows): "Ticket Price", "Total # of Tickets",
 * "Overall Odds", "Top Prize".
 * "REMAINING UNCLAIMED PRIZES" table, one row per tier, 3 cells:
 *   [0] Prize Amount   (amount)
 *   [1] Total Prizes   (originalCount)
 *   [2] Unclaimed Prizes (remaining)
 */
export function parseCtDetail(html: string, gameId: string): RawGame | null {
  const $ = cheerio.load(html);

  const name = $(".tab-heading-holder h2").first().text().trim();

  // Info table: map each label cell to its value cell.
  const info = new Map<string, string>();
  $(".img-detail-block table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length >= 2) {
      const label = $(tds[0]).text().replace(/\s+/g, " ").trim().toLowerCase();
      info.set(label, $(tds[1]).text().trim());
    }
  });

  const price = num(info.get("ticket price:"));
  const totalTickets = num(info.get("total # of tickets:"));
  const oddsText = info.get("overall odds:") ?? "";
  const overallOddsMatch = /1\s*in\s*([\d.,]+)/i.exec(oddsText);
  const overallOdds = overallOddsMatch ? num(overallOddsMatch[1]) : NaN;

  if (!name || !Number.isFinite(price)) return null;

  const tiers: PrizeTier[] = [];
  $(".unclaimed-prize-wrap table tbody tr").each((_, tr) => {
    const cells = $(tr).find("td").map((_, td) => $(td).text().trim()).get();
    if (cells.length < 3) return;
    const amount = num(cells[0]);
    const originalCount = num(cells[1]);
    const remaining = num(cells[2]);
    if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) return;
    tiers.push({
      amount,
      originalCount,
      remaining: Number.isFinite(remaining) ? remaining : 0,
    });
  });

  if (tiers.length === 0) return null;

  const game: RawGame = {
    state: "ct",
    gameId,
    name,
    price,
    url: `${LIST_URL}?g=${gameId}`,
    tiers,
  };
  // EV anchor: overall odds, falling back to total ticket count.
  if (Number.isFinite(overallOdds)) game.overallOdds = overallOdds;
  if (Number.isFinite(totalTickets)) game.totalTickets = totalTickets;
  if (game.overallOdds === undefined && game.totalTickets === undefined) return null;

  return game;
}

/** Fetch and parse live Connecticut scratch-game data. */
export async function scrapeCt(): Promise<{ source: string; games: RawGame[] }> {
  // Touch the landing page via the shared fetcher (honours its UA / timeout).
  await fetchText(LIST_URL);

  const ids = await collectGameIds();
  const games: RawGame[] = [];
  for (const id of ids) {
    try {
      const html = await fetchAjax(`${BASE}/ajax/getScratchGameDetail?g=${id}`);
      const game = parseCtDetail(html, id);
      if (game) games.push(game);
    } catch {
      // Skip a single unreachable detail fragment.
    }
  }

  if (games.length === 0) {
    throw new Error(
      "CT parser found 0 games — the list or detail layout may have changed. Inspect the markup.",
    );
  }
  return { source: LIST_URL, games };
}
