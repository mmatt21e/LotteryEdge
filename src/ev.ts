import { rawIssues, computedIssues } from "../shared/quality.js";
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

/** Estimate a print run only from published anchors; never invent a payout floor.
 * Differences above 10% between independently supplied anchors require review.
 * The tolerance accommodates published rounded odds, not currency-scale errors. */
export function estimateOriginalTickets(tiers: PrizeTier[], anchor: TicketAnchor = {}): number {
  const perTier = tiers.filter(t=>t.odds && t.odds>=1 && t.originalCount>0).map(t=>t.odds!*t.originalCount);
  const winning=tiers.reduce((n,t)=>n+t.originalCount,0);
  const anchors=[...perTier, ...(anchor.totalTickets ? [anchor.totalTickets]:[]), ...(anchor.overallOdds ? [winning*anchor.overallOdds]:[])];
  if(!anchors.length) return 0;
  const estimate=median(anchors);
  if(!Number.isFinite(estimate) || estimate<=0 || anchors.some(n=>!Number.isFinite(n)||Math.abs(n-estimate)/estimate>0.10)) throw new Error("Conflicting ticket-count anchors require source review");
  if(anchor.price && tiers.reduce((n,t)=>n+t.amount*t.originalCount,0)>estimate*anchor.price*1.01) throw new Error("Original prize pool exceeds ticket revenue; no automatic payout-floor repair");
  return Math.round(estimate);
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
  const issues = rawIssues(game);
  if (issues.length) throw new Error(issues.join("; "));
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

  const result = {
    originalTickets,
    fractionRemaining: round(frac, 4),
    ticketsRemaining,
    remainingPrizeValue: Math.round(remValue),
    evPerTicket: round(evPerTicket, 4),
    roi: round(roi, 4),
    topPrizesRemaining: top?.remaining ?? 0,
    topPrizeAmount: top?.amount ?? 0,
  };
  const invalid = computedIssues({ ...game, computed: result });
  if (invalid.length) throw new Error(invalid.join("; "));
  return result;
}

function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
