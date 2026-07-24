import { fetchJson } from "../http.js";
import type { WinnerRecord } from "../../types.js";

/**
 * Michigan — the same GraphQL endpoint the prizes adapter uses also serves a
 * public `bigWinners` feed: every win of $600+ with the game, the selling
 * retailer and its city, and the date. ~1.5M records back to 2009; no winner
 * names. IMPORTANT: prizeAmount is in CENTS (min 60000 = $600).
 *
 * Retail scratch-offs are identified by "_INSTORE_INSTANT_" in the game
 * identifier; bare identifiers (POWERBALL) are draw games; online instants
 * are excluded by requiring a retailer.
 */
const API_URL = "https://www.michiganlottery.com/api";

const QUERY = `query BigWinnersList($numberOfResults: Int!, $startIndex: Int!, $sortOption: String, $sortDirection: String, $minimumPrizeAmount: Int) {
  bigWinners(queryInput: {numberOfResults: $numberOfResults, startIndex: $startIndex, sortOption: $sortOption, sortDirection: $sortDirection, minimumPrizeAmount: $minimumPrizeAmount}) {
    results { date gameName gameIdentifier prizeAmount retailerName retailerCity }
    count
  }
}`;

interface MiWinnerRow {
  date?: string; // YYYY-MM-DD
  gameName?: string;
  gameIdentifier?: string;
  prizeAmount?: number; // CENTS
  retailerName?: string;
  retailerCity?: string;
}

export function parseMiWinners(rows: MiWinnerRow[]): WinnerRecord[] {
  const winners: WinnerRecord[] = [];
  for (const r of rows) {
    const retailer = (r.retailerName ?? "").trim();
    const game = (r.gameName ?? "").trim();
    const prize = Number(r.prizeAmount) / 100; // cents -> dollars
    if (!retailer || !game || !Number.isFinite(prize) || prize <= 0) continue;
    const ident = r.gameIdentifier ?? "";
    winners.push({
      game,
      prize,
      retailer,
      city: (r.retailerCity ?? "").trim() || undefined,
      date: r.date?.slice(0, 10),
      scratch: ident.includes("_INSTORE_INSTANT_")
        ? true
        : ident && !ident.includes("_")
          ? false // bare identifiers are draw games (POWERBALL, ...)
          : undefined,
    });
  }
  return winners;
}

export async function scrapeMiWinners(): Promise<{ source: string; winners: WinnerRecord[] }> {
  const body = JSON.stringify({
    query: QUERY,
    variables: {
      numberOfResults: 500,
      startIndex: 0,
      sortOption: "date",
      sortDirection: "desc",
      minimumPrizeAmount: 60_000, // $600, the feed's own floor (in cents)
    },
  });
  const json = await fetchJson<{
    data?: { bigWinners?: { results?: MiWinnerRow[] } };
    errors?: unknown;
  }>(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (json.errors)
    throw new Error(`MI winners GraphQL error: ${JSON.stringify(json.errors).slice(0, 200)}`);
  const winners = parseMiWinners(json.data?.bigWinners?.results ?? []);
  if (winners.length === 0) throw new Error("MI winners: 0 rows parsed — query shape changed?");
  return { source: API_URL, winners };
}
