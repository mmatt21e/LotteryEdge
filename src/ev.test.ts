import { describe, it, expect } from "vitest";
import {
  estimateOriginalTickets,
  fractionRemaining,
  remainingPrizeValue,
  computeStats,
} from "./ev.js";
import type { RawGame } from "./types.js";

// A clean synthetic game: 1,000,000 tickets, $10 each.
// Tier A: 10 top prizes of $100k, odds 1 in 100,000.
// Tier B: 1000 prizes of $100,    odds 1 in 1,000.
const clean: RawGame = {
  state: "nc",
  gameId: "test",
  name: "Test Game",
  price: 10,
  tiers: [
    { amount: 100000, odds: 100000, originalCount: 10, remaining: 5 },
    { amount: 100, odds: 1000, originalCount: 1000, remaining: 500 },
  ],
};

describe("estimateOriginalTickets", () => {
  it("recovers the print run from odds * count", () => {
    // Both tiers imply 1,000,000 tickets.
    expect(estimateOriginalTickets(clean.tiers)).toBe(1_000_000);
  });

  it("returns 0 when no tier publishes odds", () => {
    expect(
      estimateOriginalTickets([{ amount: 5, originalCount: 100, remaining: 50 }]),
    ).toBe(0);
  });

  it("is robust to one mis-published tier via the median", () => {
    const tiers = [
      { amount: 1, odds: 100, originalCount: 100, remaining: 0 }, // 10,000
      { amount: 2, odds: 100, originalCount: 100, remaining: 0 }, // 10,000
      { amount: 3, odds: 999, originalCount: 100, remaining: 0 }, // 99,900 outlier
    ];
    expect(estimateOriginalTickets(tiers)).toBe(10_000);
  });
});

describe("fractionRemaining", () => {
  it("is total remaining / total original prizes", () => {
    // (5 + 500) / (10 + 1000) = 505/1010 = 0.5
    expect(fractionRemaining(clean.tiers)).toBeCloseTo(0.5, 5);
  });

  it("returns 0 for an empty pool", () => {
    expect(fractionRemaining([])).toBe(0);
  });
});

describe("remainingPrizeValue", () => {
  it("sums amount * remaining", () => {
    // 100000*5 + 100*500 = 500000 + 50000 = 550000
    expect(remainingPrizeValue(clean.tiers)).toBe(550_000);
  });
});

describe("computeStats", () => {
  it("produces coherent EV and ROI", () => {
    const s = computeStats(clean);
    expect(s.originalTickets).toBe(1_000_000);
    expect(s.fractionRemaining).toBeCloseTo(0.5, 4);
    expect(s.ticketsRemaining).toBe(500_000);
    expect(s.remainingPrizeValue).toBe(550_000);
    // EV = 550000 / 500000 = 1.10 per ticket
    expect(s.evPerTicket).toBeCloseTo(1.1, 4);
    // ROI = 1.10 / 10 = 0.11
    expect(s.roi).toBeCloseTo(0.11, 4);
    expect(s.topPrizeAmount).toBe(100000);
    expect(s.topPrizesRemaining).toBe(5);
  });

  it("does not divide by zero when the game is sold out", () => {
    const soldOut: RawGame = {
      ...clean,
      tiers: clean.tiers.map((t) => ({ ...t, remaining: 0 })),
    };
    const s = computeStats(soldOut);
    expect(s.ticketsRemaining).toBe(0);
    expect(s.evPerTicket).toBe(0);
    expect(s.roi).toBe(0);
  });
});

describe("anchor payout sanity (NH Fat Stacks bug)", () => {
  // No per-tier odds. Prize pool = $500k. A truthful print run of 1,000,000 at
  // $5 = $5M sales → 10% payout. A stale totalTickets of 100,000 would imply a
  // $500k pool on $500k sales = 100% payout (impossible).
  const tiers = [
    { amount: 100000, originalCount: 5, remaining: 5 }, // $500k pool
  ];
  const overallOdds = 200_000; // 5 winners × 200,000 = 1,000,000 tickets

  it("prefers the odds identity when totalTickets implies an impossible payout", () => {
    const est = estimateOriginalTickets(tiers, {
      overallOdds,
      totalTickets: 100_000, // bad (half-ish / stale)
      price: 5,
    });
    expect(est).toBe(1_000_000); // odds-derived, not the bad total
  });

  it("keeps a stated total when it is consistent with a plausible payout", () => {
    const est = estimateOriginalTickets(tiers, {
      overallOdds,
      totalTickets: 1_000_000, // agrees with odds
      price: 5,
    });
    expect(est).toBe(1_000_000);
  });

  it("floors a lone total-tickets anchor so payout cannot exceed ~95%", () => {
    // Only a (too-low) total anchor, no odds: prize $500k at $5 needs ≥ ~105k
    // tickets to stay under 95% payout, so 50k must be raised.
    const est = estimateOriginalTickets(tiers, { totalTickets: 50_000, price: 5 });
    expect(est).toBeGreaterThanOrEqual(Math.round(500_000 / (5 * 0.95)));
  });
});
