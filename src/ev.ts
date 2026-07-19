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
  /** Ticket price, used only to sanity-check anchors against payout ratio. */
  price?: number;
}

/**
 * A scratch game cannot pay out more than it takes in. Realistic payout tops
 * out near 80–90%; anything above this ceiling means an anchor is wrong (e.g. a
 * stale/half ticket count), so we reject/repair it rather than publish a bogus
 * positive EV.
 */
const MAX_PAYOUT = 0.95;

/** Total original prize dollars printed (Σ amount × originalCount). */
function originalPrizeValue(tiers: PrizeTier[]): number {
  return tiers.reduce((s, t) => s + t.amount * t.originalCount, 0);
}

/** Payout ratio a given ticket-count estimate would imply (Infinity if unknown). */
function impliedPayout(tiers: PrizeTier[], tickets: number, price?: number): number {
  if (!tickets || !price || price <= 0) return Infinity;
  return originalPrizeValue(tiers) / (tickets * price);
}

/**
 * Estimate the original print run (total tickets) for a game.
 *
 * Preference order:
 *  1. Per-tier odds — "1 in X" implies tickets ≈ odds × originalCount for each
 *     tier; take the median (robust to a rounded/bad tier). (NC-style.)
 *  2. A whole-game anchor: a stated total-tickets count and/or overall odds
 *     (Σ originalCount × overallOdds). When BOTH exist and disagree, prefer the
 *     one implying a physically possible payout — a reported ticket total that
 *     conflicts with the odds×counts identity is the unreliable one (observed
 *     on NH "Fat Stacks", whose ticketsOrdered was ~half the true run).
 *  3. Unknown → 0 (EV can't be computed for this game).
 *
 * A final floor guarantees the estimate never implies a >MAX_PAYOUT payout.
 */
export function estimateOriginalTickets(tiers: PrizeTier[], anchor: TicketAnchor = {}): number {
  const perTier = tiers
    .filter((t) => t.odds && t.odds > 0 && t.originalCount > 0)
    .map((t) => t.odds! * t.originalCount);
  if (perTier.length > 0) return Math.round(median(perTier));

  const winning = tiers.reduce((s, t) => s + t.originalCount, 0);
  const fromTotal =
    anchor.totalTickets && anchor.totalTickets > 0 ? Math.round(anchor.totalTickets) : 0;
  const fromOdds =
    anchor.overallOdds && anchor.overallOdds > 0 && winning > 0
      ? Math.round(winning * anchor.overallOdds)
      : 0;

  let est = 0;
  if (fromTotal > 0 && fromOdds > 0) {
    // Both anchors present: default to the stated total, but switch to the
    // odds-derived count if the total implies an impossible payout and the
    // odds estimate is more plausible.
    const pTotal = impliedPayout(tiers, fromTotal, anchor.price);
    const pOdds = impliedPayout(tiers, fromOdds, anchor.price);
    est = pTotal > MAX_PAYOUT && pOdds <= pTotal ? fromOdds : fromTotal;
  } else {
    est = fromTotal || fromOdds;
  }
  if (est <= 0) return 0;

  // Backstop: raise an implausibly-low estimate so payout can't exceed the
  // ceiling (never lowers a good estimate).
  if (anchor.price && anchor.price > 0) {
    const floor = Math.round(originalPrizeValue(tiers) / (anchor.price * MAX_PAYOUT));
    if (floor > est) est = floor;
  }
  return est;
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
    price: game.price,
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
