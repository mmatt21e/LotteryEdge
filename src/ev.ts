import type { PrizeTier, RawGame, ComputedStats } from "./types.js";

/** Median of a numeric array (0 for empty). */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Optional whole-game anchors for states that don't publish per-tier odds. */
export interface TicketAnchor {
  /** Overall odds "1 in X" of winning any prize. */
  overallOdds?: number;
  /** Total tickets printed, if the source states it directly. */
  totalTickets?: number;
}

/**
 * Estimate the original print run (total tickets) for a game.
 *
 * Preference order:
 *  1. Per-tier odds — "1 in X" implies tickets ≈ odds × originalCount for each
 *     tier; take the median (robust to a rounded/bad tier). (NC-style.)
 *  2. A stated total-tickets anchor. (Some sources publish it.)
 *  3. Overall odds — totalWinningTickets (Σ originalCount) × overallOdds.
 *     (MA-style: per-tier counts + remaining but no per-tier odds.)
 *  4. Unknown → 0 (EV can't be computed for this game).
 */
export function estimateOriginalTickets(tiers: PrizeTier[], anchor: TicketAnchor = {}): number {
  const perTier = tiers
    .filter((t) => t.odds && t.odds > 0 && t.originalCount > 0)
    .map((t) => t.odds! * t.originalCount);
  if (perTier.length > 0) return Math.round(median(perTier));

  if (anchor.totalTickets && anchor.totalTickets > 0) return Math.round(anchor.totalTickets);

  if (anchor.overallOdds && anchor.overallOdds > 0) {
    const winning = tiers.reduce((s, t) => s + t.originalCount, 0);
    return Math.round(winning * anchor.overallOdds);
  }
  return 0;
}

/**
 * Fraction of the ticket pool still unsold, approximated by the fraction of
 * prizes still unclaimed. This assumes prizes are won in proportion to tickets
 * sold (true on average for a well-shuffled game). It is an ESTIMATE.
 */
export function fractionRemaining(tiers: PrizeTier[]): number {
  const origTotal = tiers.reduce((s, t) => s + t.originalCount, 0);
  const remTotal = tiers.reduce((s, t) => s + t.remaining, 0);
  if (origTotal <= 0) return 0;
  return remTotal / origTotal;
}

/** Sum of (prize amount * prizes remaining) across all tiers. */
export function remainingPrizeValue(tiers: PrizeTier[]): number {
  return tiers.reduce((s, t) => s + t.amount * t.remaining, 0);
}

/** Compute the full derived EV statistics for a scraped game. */
export function computeStats(game: RawGame): ComputedStats {
  const tiers = game.tiers;
  const originalTickets = estimateOriginalTickets(tiers, {
    overallOdds: game.overallOdds,
    totalTickets: game.totalTickets,
  });
  const frac = fractionRemaining(tiers);
  const ticketsRemaining = Math.round(originalTickets * frac);
  const remValue = remainingPrizeValue(tiers);
  const evPerTicket = ticketsRemaining > 0 ? remValue / ticketsRemaining : 0;
  const roi = game.price > 0 ? evPerTicket / game.price : 0;

  // Highest-value tier for the "top prizes remaining" headline.
  const top = tiers.reduce<PrizeTier | null>(
    (best, t) => (best === null || t.amount > best.amount ? t : best),
    null,
  );

  return {
    originalTickets,
    fractionRemaining: round(frac, 4),
    ticketsRemaining,
    remainingPrizeValue: Math.round(remValue),
    evPerTicket: round(evPerTicket, 4),
    roi: round(roi, 4),
    topPrizesRemaining: top?.remaining ?? 0,
    topPrizeAmount: top?.amount ?? 0,
  };
}

function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
