import type { Game, GameSeries, HistoryPoint } from "./types.js";

/**
 * Odds of winning MORE than the ticket price ("1 in X to profit").
 * Combine per-tier odds for tiers whose prize exceeds the price.
 * Returns X (as in "1 in X"), or null if odds aren't published.
 */
export function profitOdds(game: Game): number | null {
  const rate = game.tiers
    .filter((t) => t.odds && t.odds > 0 && t.amount > game.price)
    .reduce((sum, t) => sum + 1 / t.odds!, 0);
  return rate > 0 ? 1 / rate : null;
}

export type ConfidenceLevel = "low" | "medium" | "high";

/**
 * How trustworthy the EV estimate is. It leans on "prizes claimed ∝ tickets
 * sold", which is noisy when almost nothing has sold (brand-new game) or when
 * almost everything has (tiny remaining-ticket denominator).
 */
export function confidence(fractionRemaining: number): {
  level: ConfidenceLevel;
  reason: string;
} {
  const sold = 1 - fractionRemaining;
  if (fractionRemaining < 0.03)
    return { level: "low", reason: "almost sold out — tiny sample of tickets left" };
  if (sold < 0.05)
    return { level: "low", reason: "barely any tickets sold yet — estimate is noisy" };
  if (sold < 0.2) return { level: "medium", reason: "still early in the game's life" };
  return { level: "high", reason: "enough tickets sold for a stable estimate" };
}

export interface Velocity {
  sold: number; // estimated tickets sold in the window
  perDay: number;
  days: number;
  from: string;
  to: string;
}

/** Estimated tickets sold between two dates, from the history series. */
export function computeVelocity(
  series: GameSeries,
  fromDate: string,
  toDate: string,
): Velocity | null {
  const inRange = series.points.filter((p) => p.date >= fromDate && p.date <= toDate);
  if (inRange.length < 2) return null;
  const first = inRange[0]!;
  const last = inRange[inRange.length - 1]!;
  const sold = Math.max(0, first.ticketsRemaining - last.ticketsRemaining);
  const days = Math.max(1, daysBetween(first.date, last.date));
  return { sold, perDay: sold / days, days, from: first.date, to: last.date };
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime();
  return Math.round(ms / 86_400_000);
}

/** YYYY-MM-DD for `daysAgo` days before today (UTC). */
export function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Direction of a numeric series: +1 rising, -1 falling, 0 flat/insufficient. */
export function trendDirection(values: number[]): -1 | 0 | 1 {
  if (values.length < 2) return 0;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const delta = last - first;
  const threshold = Math.abs(first) * 0.01; // ignore <1% wiggle
  if (delta > threshold) return 1;
  if (delta < -threshold) return -1;
  return 0;
}

/** Map a series of values to an SVG polyline "x,y ..." string in a w×h box. */
export function sparklinePath(values: number[], w: number, h: number, pad = 1): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;
  return values
    .map((v, i) => {
      const x = n === 1 ? w / 2 : pad + (i / (n - 1)) * (w - 2 * pad);
      const y = pad + (1 - (v - min) / span) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Net expected return per $1 for a history point (roi - 1). */
export const pointNet = (p: HistoryPoint): number => p.roi - 1;

/**
 * Estimated withholding on a single prize (rough, for the "after tax" view):
 *  - under $600: not reported → 0
 *  - $600–$4,999: NC state income tax (~4.5%)
 *  - $5,000+: federal withholding 24% + NC 4.5%
 */
function taxRate(amount: number): number {
  if (amount < 600) return 0;
  if (amount < 5000) return 0.045;
  return 0.24 + 0.045;
}

/**
 * Sell-through "ending soon" signal. NC doesn't publish forward claim
 * deadlines for active games, so we approximate from how little of the print
 * run is left: a game with almost no tickets remaining is winding down and
 * likely to be pulled (with a claim deadline announced) soon.
 */
export function endingSoon(game: Game): "ending" | "soon" | null {
  const fr = game.computed.fractionRemaining;
  if (fr < 0.05) return "ending";
  if (fr < 0.1) return "soon";
  return null;
}

/** Expected number of tickets you'd buy, on average, to hit one top prize. */
export function ticketsToTopPrize(game: Game): number | null {
  const { ticketsRemaining, topPrizesRemaining } = game.computed;
  if (topPrizesRemaining <= 0 || ticketsRemaining <= 0) return null;
  return Math.round(ticketsRemaining / topPrizesRemaining);
}

export interface BudgetPick {
  game: Game;
  count: number;
  spend: number;
  expectedNet: number; // negative = expected loss
  roi: number;
}

/**
 * For a budget, rank affordable games by value/$1 and show how many tickets fit
 * and the expected net. Greedy per single game (simple, transparent).
 */
export function recommendForBudget(games: Game[], budget: number, afterTax: boolean): BudgetPick[] {
  return games
    .filter((g) => g.price > 0 && g.price <= budget)
    .map((g) => {
      const roi = effectiveRoi(g, afterTax);
      const count = Math.floor(budget / g.price);
      const spend = count * g.price;
      return { game: g, count, spend, expectedNet: spend * (roi - 1), roi };
    })
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 5);
}

/** ROI to display, optionally after estimated taxes. Recomputed from tiers. */
export function effectiveRoi(game: Game, afterTax: boolean): number {
  if (!afterTax) return game.computed.roi;
  const tr = game.computed.ticketsRemaining;
  if (tr <= 0 || game.price <= 0) return 0;
  const afterTaxValue = game.tiers.reduce(
    (s, t) => s + t.amount * t.remaining * (1 - taxRate(t.amount)),
    0,
  );
  return afterTaxValue / tr / game.price;
}
