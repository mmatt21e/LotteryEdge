import { readFile, writeFile } from "node:fs/promises";
import type { Game } from "./types.js";

/** Per-tier remaining count on a given day, for day-over-day prize-claim diffs. */
export interface TierPoint {
  amount: number;
  remaining: number;
}

/** One daily observation of a game's derived stats. */
export interface HistoryPoint {
  date: string; // YYYY-MM-DD (UTC)
  ticketsRemaining: number;
  roi: number;
  topPrizesRemaining: number;
  fractionRemaining: number;
  remainingPrizeValue: number;
  // Per-tier remaining counts, retained only on the most recent points (see
  // TIER_POINTS) so we can count individual prizes claimed each day without
  // bloating the whole committed history file.
  tiers?: TierPoint[];
}

export interface GameSeries {
  name: string;
  price: number;
  points: HistoryPoint[];
}

export interface History {
  state: string;
  updatedAt: string;
  series: Record<string, GameSeries>;
}

const MAX_POINTS = 400; // ~13 months of daily snapshots per game
const TIER_POINTS = 8; // days of per-tier detail to retain (bounds file size)

/** Merge today's snapshot into the running history (one point per date/game). */
export function upsertHistory(
  prev: History | null,
  state: string,
  games: Game[],
  date: string,
  updatedAt: string,
): History {
  const series: Record<string, GameSeries> = prev?.series ? { ...prev.series } : {};

  for (const g of games) {
    const point: HistoryPoint = {
      date,
      ticketsRemaining: g.computed.ticketsRemaining,
      roi: g.computed.roi,
      topPrizesRemaining: g.computed.topPrizesRemaining,
      fractionRemaining: g.computed.fractionRemaining,
      remainingPrizeValue: g.computed.remainingPrizeValue,
      tiers: g.tiers.map((t) => ({ amount: t.amount, remaining: t.remaining })),
    };
    const existing = series[g.gameId];
    const kept = existing ? existing.points.filter((p) => p.date !== date) : [];
    kept.push(point);
    kept.sort((a, b) => a.date.localeCompare(b.date));
    const points = kept.slice(-MAX_POINTS);
    // Drop per-tier detail from all but the most recent TIER_POINTS days.
    const cutoff = points.length - TIER_POINTS;
    points.forEach((p, i) => {
      if (i < cutoff && p.tiers) delete p.tiers;
    });
    series[g.gameId] = { name: g.name, price: g.price, points };
  }

  return { state, updatedAt, series };
}

export async function loadHistory(path: string): Promise<History | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as History;
  } catch {
    return null; // first run — no history yet
  }
}

export async function saveHistory(path: string, history: History): Promise<void> {
  await writeFile(path, JSON.stringify(history) + "\n");
}
