import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const ORIGIN = "https://www.texaslottery.com";
/** List page: one big table with every game's full prize breakdown. */
const LIST_URL = `${ORIGIN}/export/sites/lottery/Games/Scratch_Offs/all.html`;

/** Parse "$1,000,000" -> 1000000, "10,879" -> 10879, "N/A" -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

interface ListGame {
  gameId: string;
  detailUrl: string;
  name: string;
  price: number;
}

/**
 * Parse the Texas "all scratch-offs" list table for game metadata only.
 *
 * Columns (8 <td> per row):
 *   Game# (link) | Start date | Price | (spacer) | Game Name | Amount | Printed | Claimed
 * The list table only surfaces the top few prize tiers per game, so we use it
 * purely to enumerate games (id, name, price, detail URL) and pull the FULL
 * prize table from each game's detail page instead.
 */
export function parseTxList(html: string): ListGame[] {
  const $ = cheerio.load(html);
  const games: ListGame[] = [];
  const seen = new Set<string>();

  $("table tbody tr").each((_, tr) => {
    const $tds = $(tr).find("td");
    if ($tds.length < 8) return;

    const $link = $tds.eq(0).find("a[href*='details.html_']").first();
    const href = $link.attr("href");
    if (!href) return; // continuation row for extra prize tiers — skip.

    const gameId = $link.text().trim();
    const name = $tds.eq(4).text().trim();
    const price = num($tds.eq(2).text());
    const detailUrl = href.startsWith("http") ? href : `${ORIGIN}${href}`;
    if (!gameId || !name || !Number.isFinite(price)) return;
    if (seen.has(gameId)) return;
    seen.add(gameId);
    games.push({ gameId, detailUrl, name, price });
  });

  return games;
}

/**
 * Parse the FULL prize table from a Texas game detail page.
 *
 * The detail page carries the complete "Prizes Printed" table with one row per
 * prize tier (down to the low $1–$5 prizes) with three columns:
 *   Amount | No. in Game* (original count) | No. Prizes Claimed
 * remaining = No. in Game − No. Prizes Claimed.  The claimed cell may wrap its
 * number in a "where sold" link, so we read the cell's text.
 */
export function parseTxDetail(html: string): PrizeTier[] {
  const $ = cheerio.load(html);
  const tiers: PrizeTier[] = [];

  $("table.large-only tbody tr").each((_, tr) => {
    const $tds = $(tr).find("td");
    if ($tds.length < 3) return;
    const amount = num($tds.eq(0).text());
    const printed = num($tds.eq(1).text());
    const claimed = num($tds.eq(2).text());
    if (!Number.isFinite(amount) || !Number.isFinite(printed)) return;
    const remaining = Number.isFinite(claimed)
      ? Math.max(printed - claimed, 0)
      : printed;
    tiers.push({ amount, originalCount: printed, remaining });
  });

  return tiers;
}

/** Pull "Overall odds ... are 1 in X" from a game detail page. */
export function parseTxOverallOdds(html: string): number {
  // The game name between "winning" and "are 1 in" may itself contain digits
  // (e.g. "$1,000,000 CROSSWORD"), so match lazily up to "are 1 in".
  const m = /Overall odds of winning[\s\S]*?\bare 1 in ([\d.,]+)/i.exec(html);
  return m ? num(m[1]) : NaN;
}

/** Fetch and parse live Texas scratch-off data. */
export async function scrapeTx(): Promise<{ source: string; games: RawGame[] }> {
  const listHtml = await fetchText(LIST_URL);
  const listGames = parseTxList(listHtml);
  if (listGames.length === 0) {
    throw new Error(
      "TX parser found 0 games — the list table layout may have changed. Inspect the markup.",
    );
  }

  // The list table only shows the top few tiers; the FULL prize table and the
  // overall-odds EV anchor both live on each game's detail page. Fetch each
  // detail page once, in small polite batches, and pull both from it.
  const detailById = new Map<string, { tiers: PrizeTier[]; overallOdds: number }>();
  const BATCH = 6;
  for (let i = 0; i < listGames.length; i += BATCH) {
    const slice = listGames.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (g) => {
        try {
          const html = await fetchText(g.detailUrl);
          const tiers = parseTxDetail(html);
          const overallOdds = parseTxOverallOdds(html);
          if (tiers.length > 0) detailById.set(g.gameId, { tiers, overallOdds });
        } catch {
          // Drop this game if its detail page fails — no reliable tiers.
        }
      }),
    );
  }

  const games: RawGame[] = listGames
    .map((g): RawGame | null => {
      const detail = detailById.get(g.gameId);
      if (!detail) return null;
      return {
        state: "tx",
        gameId: g.gameId,
        name: g.name,
        price: g.price,
        url: g.detailUrl,
        tiers: detail.tiers,
        overallOdds: Number.isFinite(detail.overallOdds) ? detail.overallOdds : undefined,
      };
    })
    .filter((g): g is RawGame => g !== null);

  if (games.length === 0) {
    throw new Error(
      "TX parser found 0 games with prize tiers — the detail page layout may have changed.",
    );
  }

  return { source: LIST_URL, games };
}
