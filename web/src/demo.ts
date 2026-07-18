import type { Game, History, GameSeries, HistoryPoint } from "./types.js";

/** Distinct calendar dates present across all series (i.e. real days of data). */
export function distinctDates(history: History | null): number {
  if (!history) return 0;
  const set = new Set<string>();
  for (const s of Object.values(history.series)) for (const p of s.points) set.add(p.date);
  return set.size;
}

/** Deterministic 0..1 generator seeded from a number (stable across reloads). */
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Plausible SAMPLE history synthesized from today's live snapshot, used only
 * when there's ≤1 real day of data. Deterministic per game so it doesn't jitter
 * between reloads. Clearly labeled as sample data wherever it's shown.
 */
export function buildDemoHistory(games: Game[], days = 12): History {
  const series: Record<string, GameSeries> = {};
  const now = Date.now();
  for (const g of games) {
    const c = g.computed;
    const seed = [...g.gameId].reduce((a, ch) => a + ch.charCodeAt(0), 0) + 7;
    const rnd = seeded(seed);
    // Back-project: earlier days had more tickets left (fewer sold).
    const dailySold = Math.max(300, Math.round(c.ticketsRemaining * (0.02 + rnd() * 0.05)));
    // Per-tier daily claims, proportional to each tier's share of the pool, so
    // low tiers show a few claims/day and the top tier usually shows none.
    const claimFrac = c.ticketsRemaining > 0 ? dailySold / c.ticketsRemaining : 0;
    const tierDaily = g.tiers.map((t) => Math.max(0, Math.round(t.remaining * claimFrac)));
    const points: HistoryPoint[] = [];
    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(now - d * 86_400_000).toISOString().slice(0, 10);
      const wobble = Math.sin((days - d) / 2 + seed) * 0.02;
      points.push({
        date,
        ticketsRemaining: c.ticketsRemaining + dailySold * d,
        roi: Math.round(Math.max(0.35, c.roi + wobble) * 10000) / 10000,
        topPrizesRemaining: c.topPrizesRemaining,
        fractionRemaining: c.fractionRemaining,
        remainingPrizeValue: c.remainingPrizeValue,
        tiers: g.tiers.map((t, ti) => ({
          amount: t.amount,
          remaining: t.remaining + tierDaily[ti]! * d,
        })),
      });
    }
    series[g.gameId] = { name: g.name, price: g.price, points };
  }
  return { state: "demo", updatedAt: new Date().toISOString(), series };
}
