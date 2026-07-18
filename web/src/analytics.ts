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

/**
 * Live odds "1 in X" for a single prize tier, recomputed from what's left:
 * estimated tickets remaining ÷ prizes of this tier still unclaimed. Returns
 * null when this tier is exhausted (no prizes left) or we can't estimate the
 * remaining ticket pool. It's an estimate on an estimate — noisier than the
 * printed odds — so the UI shows it beside, not instead of, the printed value.
 */
export function liveTierOdds(ticketsRemaining: number, tierRemaining: number): number | null {
  if (tierRemaining <= 0 || ticketsRemaining <= 0) return null;
  return ticketsRemaining / tierRemaining;
}

/**
 * "1 in X to profit" recomputed from remaining prizes vs. estimated tickets
 * left, rather than from the printed odds. Consistent with the live EV.
 */
export function liveProfitOdds(game: Game): number | null {
  const tr = game.computed.ticketsRemaining;
  if (!tr || tr <= 0) return null;
  const winnersLeft = game.tiers
    .filter((t) => t.amount > game.price)
    .reduce((sum, t) => sum + Math.max(0, t.remaining), 0);
  return winnersLeft > 0 ? tr / winnersLeft : null;
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

export interface DailySales {
  avgPerDay: number; // average tickets sold per day over the whole history span
  previousDay: number | null; // tickets sold in the most recent day-over-day step
  spanDays: number; // days of history the average covers
  lastDate: string; // date of the most recent snapshot
}

/**
 * Per-game daily sales pace from the time-series: the long-run average tickets
 * sold per day, plus the most recent day's drop. Needs ≥2 snapshots; returns
 * null otherwise (and the caller labels it "sample" when history is illustrative).
 */
export interface DailyChange {
  date: string; // the day this change was observed (YYYY-MM-DD)
  ticketsSold: number; // drop in tickets remaining vs the prior snapshot
  prizeValueWon: number; // $ value of prizes claimed that day (all tiers)
  topPrizesWon: number; // count of top-tier prizes claimed that day
}

/**
 * Day-by-day deltas from the time-series: for each consecutive pair of daily
 * snapshots, how many tickets sold and how much prize value was claimed.
 * Most-recent day first. Empty if fewer than 2 snapshots exist.
 */
export interface PrizeWon {
  amount: number;
  count: number;
}
export interface PreviousDayPrizes {
  date: string; // the day these prizes were claimed
  prizes: PrizeWon[]; // per-tier counts (>0 only), largest prize first
  total: number; // total prizes claimed that day
}

/**
 * Counts how many of each individual prize were claimed on the most recent day,
 * by diffing per-tier remaining between the last two snapshots. Returns null if
 * the two latest points don't both carry per-tier detail (only the recent days
 * do — see the scraper's TIER_POINTS), so the UI can explain it's still filling.
 */
export function prizesWonPreviousDay(series: GameSeries | undefined): PreviousDayPrizes | null {
  if (!series || series.points.length < 2) return null;
  const pts = [...series.points].sort((a, b) => a.date.localeCompare(b.date));
  const cur = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  if (!cur.tiers || !prev.tiers) return null;
  const before = new Map(prev.tiers.map((t) => [t.amount, t.remaining]));
  const prizes: PrizeWon[] = [];
  for (const t of cur.tiers) {
    const had = before.get(t.amount);
    if (had == null) continue;
    const count = had - t.remaining;
    if (count > 0) prizes.push({ amount: t.amount, count });
  }
  prizes.sort((a, b) => b.amount - a.amount);
  return { date: cur.date, prizes, total: prizes.reduce((s, p) => s + p.count, 0) };
}

export function dailyBreakdown(series: GameSeries | undefined): DailyChange[] {
  if (!series || series.points.length < 2) return [];
  const pts = [...series.points].sort((a, b) => a.date.localeCompare(b.date));
  const out: DailyChange[] = [];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    out.push({
      date: cur.date,
      ticketsSold: Math.max(0, prev.ticketsRemaining - cur.ticketsRemaining),
      prizeValueWon: Math.max(0, prev.remainingPrizeValue - cur.remainingPrizeValue),
      topPrizesWon: Math.max(0, prev.topPrizesRemaining - cur.topPrizesRemaining),
    });
  }
  return out.reverse();
}

export function dailySales(series: GameSeries | undefined): DailySales | null {
  if (!series || series.points.length < 2) return null;
  const pts = [...series.points].sort((a, b) => a.date.localeCompare(b.date));
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  const spanDays = Math.max(1, daysBetween(first.date, last.date));
  const avgPerDay = Math.max(0, first.ticketsRemaining - last.ticketsRemaining) / spanDays;
  const gap = Math.max(1, daysBetween(prev.date, last.date));
  const previousDay = Math.max(0, prev.ticketsRemaining - last.ticketsRemaining) / gap;
  return { avgPerDay, previousDay, spanDays, lastDate: last.date };
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

export interface TopPrizeAttempt {
  tickets: number; // avg tickets to hit one top prize (from live remaining odds)
  cost: number; // tickets × price
  winnings: number; // expected total prize $ won across those tickets (all tiers)
  net: number; // winnings − cost (essentially always negative)
}

/**
 * Models "buy enough tickets to (on average) win the top prize once": how many
 * tickets that takes, what it costs, and the expected total winnings across all
 * of those tickets — the top prize plus every smaller prize hit along the way.
 * Winnings use the game's expected value (optionally after tax), so this is a
 * long-run average, not a guarantee. Returns null if no top prize remains.
 */
export function topPrizeAttempt(game: Game, afterTax = false): TopPrizeAttempt | null {
  const tickets = ticketsToTopPrize(game);
  if (!tickets) return null;
  const cost = tickets * game.price;
  const winnings = effectiveRoi(game, afterTax) * cost; // roi = EV/price, so EV×tickets
  return { tickets, cost, winnings, net: winnings - cost };
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
