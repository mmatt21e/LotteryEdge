import { describe, it, expect } from "vitest";
import type { Game, GameSeries } from "./types.js";
import {
  profitOdds,
  liveTierOdds,
  liveProfitOdds,
  confidence,
  computeVelocity,
  simulateGame,
  effectiveRoi,
  ticketsToTopPrize,
  topPrizeAttempt,
  recommendForBudget,
  endingSoon,
  trendDirection,
  sparklinePath,
} from "./analytics.js";

/** A $10 game: 100,000 tickets left, 2 top prizes, generous mid tier. */
function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    state: "nc",
    gameId: "1",
    name: "Test",
    price: 10,
    tiers: [
      { amount: 100_000, odds: 250_000, originalCount: 4, remaining: 2 },
      { amount: 100, odds: 100, originalCount: 10_000, remaining: 5_000 },
      { amount: 10, odds: 10, originalCount: 100_000, remaining: 50_000 },
    ],
    computed: {
      originalTickets: 1_000_000,
      fractionRemaining: 0.5,
      ticketsRemaining: 100_000,
      remainingPrizeValue: 100_000 * 2 + 100 * 5_000 + 10 * 50_000, // 1,200,000
      evPerTicket: 12,
      roi: 1.2,
      topPrizesRemaining: 2,
      topPrizeAmount: 100_000,
    },
    ...overrides,
  };
}

describe("profitOdds", () => {
  it("combines only tiers that beat the ticket price", () => {
    const g = makeGame();
    // $100k (1/250k) and $100 (1/100) beat $10; the $10 tier breaks even.
    const rate = 1 / 250_000 + 1 / 100;
    expect(profitOdds(g)).toBeCloseTo(1 / rate, 6);
  });
  it("is null when no odds are published", () => {
    const g = makeGame();
    g.tiers = g.tiers.map((t) => ({ ...t, odds: undefined }));
    expect(profitOdds(g)).toBeNull();
  });
});

describe("liveTierOdds / liveProfitOdds", () => {
  it("derives tier odds from remaining pools", () => {
    expect(liveTierOdds(100_000, 2)).toBe(50_000);
    expect(liveTierOdds(100_000, 0)).toBeNull();
    expect(liveTierOdds(0, 5)).toBeNull();
  });
  it("derives profit odds from winners still in the pool", () => {
    const g = makeGame();
    // Winners above price: 2 + 5,000.
    expect(liveProfitOdds(g)).toBeCloseTo(100_000 / 5_002, 6);
  });
});

describe("confidence", () => {
  it("flags nearly-sold-out games low", () => {
    expect(confidence(0.02).level).toBe("low");
  });
  it("flags brand-new games low", () => {
    expect(confidence(0.97).level).toBe("low");
  });
  it("mid-life games are high", () => {
    expect(confidence(0.5).level).toBe("high");
  });
});

describe("computeVelocity", () => {
  const series: GameSeries = {
    name: "Test",
    price: 10,
    points: [
      { date: "2026-07-01", ticketsRemaining: 1000, roi: 0.9, topPrizesRemaining: 2, fractionRemaining: 0.5, remainingPrizeValue: 1 },
      { date: "2026-07-03", ticketsRemaining: 800, roi: 0.9, topPrizesRemaining: 2, fractionRemaining: 0.5, remainingPrizeValue: 1 },
      { date: "2026-07-05", ticketsRemaining: 500, roi: 0.9, topPrizesRemaining: 2, fractionRemaining: 0.5, remainingPrizeValue: 1 },
    ],
  };
  it("computes sold and per-day over the window", () => {
    const v = computeVelocity(series, "2026-07-01", "2026-07-05")!;
    expect(v.sold).toBe(500);
    expect(v.days).toBe(4);
    expect(v.perDay).toBe(125);
  });
  it("needs at least two points in range", () => {
    expect(computeVelocity(series, "2026-07-05", "2026-07-05")).toBeNull();
  });
});

describe("simulateGame", () => {
  it("baseline equals the published stats", () => {
    const g = makeGame();
    const sim = simulateGame(g, {}, 0);
    expect(sim.ticketsRemaining).toBe(100_000);
    expect(sim.roi).toBeCloseTo(1.2, 6);
    expect(sim.removedWinners).toBe(0);
  });
  it("clamps removals to what's actually left", () => {
    const g = makeGame();
    const sim = simulateGame(g, { 100_000: 99 }, 0);
    expect(sim.tiers[0]!.removed).toBe(2); // only 2 exist
    expect(sim.topOdds).toBeNull(); // top tier exhausted
  });
  it("never drops tickets below the winners still in the pool", () => {
    const g = makeGame();
    const sim = simulateGame(g, {}, 10_000_000);
    const winners = sim.tiers.reduce((s, t) => s + t.remaining, 0);
    expect(sim.ticketsRemaining).toBe(winners);
  });
});

describe("effectiveRoi", () => {
  it("returns published roi when tax is off", () => {
    expect(effectiveRoi(makeGame(), false)).toBe(1.2);
  });
  it("reduces roi when tax is on (big prizes withheld)", () => {
    const g = makeGame();
    const taxed = effectiveRoi(g, true);
    expect(taxed).toBeLessThan(1.2);
    expect(taxed).toBeGreaterThan(0);
  });
  it("prizes under $600 are never withheld", () => {
    const g = makeGame();
    g.tiers = [{ amount: 100, originalCount: 10, remaining: 5 }];
    g.computed = { ...g.computed, ticketsRemaining: 100, remainingPrizeValue: 500 };
    // After-tax recomputes from tiers: $500 left ÷ 100 tickets ÷ $10 — untaxed.
    expect(effectiveRoi(g, true)).toBeCloseTo(0.5, 10);
  });
});

describe("top-prize chase & budget", () => {
  it("ticketsToTopPrize divides the pool by top prizes left", () => {
    expect(ticketsToTopPrize(makeGame())).toBe(50_000);
    const gone = makeGame();
    gone.computed = { ...gone.computed, topPrizesRemaining: 0 };
    expect(ticketsToTopPrize(gone)).toBeNull();
  });
  it("topPrizeAttempt costs tickets × price and wins EV × cost", () => {
    const a = topPrizeAttempt(makeGame(), false)!;
    expect(a.tickets).toBe(50_000);
    expect(a.cost).toBe(500_000);
    expect(a.winnings).toBeCloseTo(1.2 * 500_000, 6);
    expect(a.net).toBeCloseTo(a.winnings - a.cost, 6);
  });
  it("recommendForBudget only offers affordable games, best value first", () => {
    const cheap = makeGame({ gameId: "c", price: 5 });
    cheap.computed = { ...cheap.computed, roi: 0.8 };
    const rich = makeGame({ gameId: "r", price: 50 });
    const picks = recommendForBudget([cheap, rich], 20, false);
    expect(picks.map((p) => p.game.gameId)).toEqual(["c"]);
    expect(picks[0]!.count).toBe(4);
    expect(picks[0]!.expectedNet).toBeCloseTo(20 * (0.8 - 1), 6);
  });
});

describe("endingSoon / trendDirection / sparklinePath", () => {
  it("thresholds on fraction remaining", () => {
    const g = makeGame();
    g.computed = { ...g.computed, fractionRemaining: 0.04 };
    expect(endingSoon(g)).toBe("ending");
    g.computed = { ...g.computed, fractionRemaining: 0.08 };
    expect(endingSoon(g)).toBe("soon");
    g.computed = { ...g.computed, fractionRemaining: 0.5 };
    expect(endingSoon(g)).toBeNull();
  });
  it("ignores sub-1% wiggle", () => {
    expect(trendDirection([1.0, 1.005])).toBe(0);
    expect(trendDirection([1.0, 1.2])).toBe(1);
    expect(trendDirection([1.0, 0.8])).toBe(-1);
  });
  it("maps values into the box", () => {
    const path = sparklinePath([0, 1], 100, 20);
    expect(path.split(" ")).toHaveLength(2);
    expect(sparklinePath([], 100, 20)).toBe("");
  });
});
