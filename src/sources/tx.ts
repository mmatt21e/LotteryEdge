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
  tiers: PrizeTier[];
}

/**
 * Parse the Texas "all scratch-offs" list table.
 *
 * Columns (8 <td> per row):
 *   Game# (link) | Start date | Price | (spacer) | Game Name | Amount | Printed | Claimed
 * A row that opens a new game carries the game-number link and name/price in the
 * leading cells; continuation rows (additional prize tiers) leave those blank.
 * remaining = Printed - Claimed.
 */
export function parseTxList(html: string): ListGame[] {
  const $ = cheerio.load(html);
  const games: ListGame[] = [];
  let current: ListGame | undefined;

  $("table tbody tr").each((_, tr) => {
    const $tds = $(tr).find("td");
    if ($tds.length < 8) return;

    const $link = $tds.eq(0).find("a[href*='details.html_']").first();
    const href = $link.attr("href");
    if (href) {
      // New game row.
      const gameId = $link.text().trim();
      const name = $tds.eq(4).text().trim();
      const price = num($tds.eq(2).text());
      const detailUrl = href.startsWith("http") ? href : `${ORIGIN}${href}`;
      if (gameId && name && Number.isFinite(price)) {
        current = { gameId, detailUrl, name, price, tiers: [] };
        games.push(current);
      } else {
        current = undefined;
      }
    }
    if (!current) return;

    // Trailing three cells: Amount | Printed | Claimed.
    const amount = num($tds.eq(5).text());
    const printed = num($tds.eq(6).text());
    const claimed = num($tds.eq(7).text());
    if (!Number.isFinite(amount) || !Number.isFinite(printed)) return;
    const remaining = Number.isFinite(claimed)
      ? Math.max(printed - claimed, 0)
      : printed;
    current.tiers.push({ amount, originalCount: printed, remaining });
  });

  return games;
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
  const listGames = parseTxList(listHtml).filter((g) => g.tiers.length > 0);
  if (listGames.length === 0) {
    throw new Error(
      "TX parser found 0 games — the list table layout may have changed. Inspect the markup.",
    );
  }

  // Overall odds (the EV anchor) live only on each game's detail page.
  // Fetch in small polite batches.
  const oddsById = new Map<string, number>();
  const BATCH = 6;
  for (let i = 0; i < listGames.length; i += BATCH) {
    const slice = listGames.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (g) => {
        try {
          const html = await fetchText(g.detailUrl);
          const odds = parseTxOverallOdds(html);
          if (Number.isFinite(odds)) oddsById.set(g.gameId, odds);
        } catch {
          // Leave anchor unset for this game if the detail page fails.
        }
      }),
    );
  }

  const games: RawGame[] = listGames.map((g) => ({
    state: "tx",
    gameId: g.gameId,
    name: g.name,
    price: g.price,
    url: g.detailUrl,
    tiers: g.tiers,
    overallOdds: oddsById.get(g.gameId),
  }));

  return { source: LIST_URL, games };
}
