import type { WinnerRecord } from "./types.js";

/** Aggregated posted-winner stats for one retailer (one list row). */
export interface RetailerStats {
  key: string; // normalized retailer+city identity
  retailer: string;
  city?: string;
  wins: number;
  totalPrize: number;
  maxPrize: number;
  lastDate?: string; // most recent posted win (YYYY-MM-DD)
  games: string[]; // distinct game names, most recently seen first
}

export type RetailerSort = "wins" | "total" | "biggest" | "recent";

// Strip punctuation/whitespace entirely so "$1,000,000 Triple Play" and
// "1000000 TRIPLE PLAY!" (posted vs official spelling) match.
const normKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Group posted winners by retailer (name+city) and total up the signal. */
export function aggregateRetailers(winners: WinnerRecord[]): RetailerStats[] {
  const byKey = new Map<string, RetailerStats>();
  for (const w of winners) {
    if (!w.retailer) continue;
    const key = `${normKey(w.retailer)}|${normKey(w.city ?? "")}`;
    let r = byKey.get(key);
    if (!r) {
      r = {
        key,
        retailer: w.retailer,
        city: w.city,
        wins: 0,
        totalPrize: 0,
        maxPrize: 0,
        games: [],
      };
      byKey.set(key, r);
    }
    r.wins += 1;
    r.totalPrize += w.prize;
    if (w.prize > r.maxPrize) r.maxPrize = w.prize;
    if (w.date && (!r.lastDate || w.date > r.lastDate)) r.lastDate = w.date;
    if (w.game && !r.games.some((g) => normKey(g) === normKey(w.game))) r.games.push(w.game);
  }
  return [...byKey.values()];
}

/** Sorted copy of the retailer list by the chosen criterion. */
export function sortRetailers(list: RetailerStats[], sort: RetailerSort): RetailerStats[] {
  const l = [...list];
  switch (sort) {
    case "total":
      return l.sort((a, b) => b.totalPrize - a.totalPrize || b.wins - a.wins);
    case "biggest":
      return l.sort((a, b) => b.maxPrize - a.maxPrize || b.wins - a.wins);
    case "recent":
      return l.sort(
        (a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || b.wins - a.wins,
      );
    default:
      return l.sort((a, b) => b.wins - a.wins || b.totalPrize - a.totalPrize);
  }
}

/**
 * Posted winners for one specific game, matched by normalized name (sources
 * post the game's display name, not its id). Most recent first.
 */
export function winnersForGame(winners: WinnerRecord[], gameName: string): WinnerRecord[] {
  const target = normKey(gameName);
  if (!target) return [];
  return winners
    .filter((w) => normKey(w.game) === target)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}
