import { describe, it, expect } from "vitest";
import { prepareSnapshot, reportingHistory } from "./dataQuality.js";
import { confidence, liveTierOdds, profitOdds, prizesWonPreviousDay, dailyBreakdown } from "./analytics.js";
import type { Game, ScrapeResult, History } from "./types.js";
const raw = { state: "nc", gameId: "1", name: "Test", price: 10, tiers: [{ amount: 100, originalCount: 100, remaining: 50, odds: 100 }] };
const game: Game = { ...raw, computed: { originalTickets: 10000, ticketsRemaining: 5000, fractionRemaining: .5, remainingPrizeValue: 5000, evPerTicket: 1, roi: .1, topPrizeAmount: 100, topPrizesRemaining: 50 } };
const data: ScrapeResult = { state: "nc", source: "official", generatedAt: "2026-09-02T12:00:00Z", gameCount: 1, games: [game] };
const now = Date.parse("2026-09-02T14:00:00Z");
describe("UI exclusion boundary", () => {
    it("keeps supported estimates and rejects stale/invalid/duplicate records without changing the input", () => {
        const before = JSON.stringify(data);
        expect(prepareSnapshot(data, null, [], now).games).toHaveLength(1);
        expect(prepareSnapshot(data, null, [], now + 72 * 3600000).games).toHaveLength(0);
        const bad = { ...data, games: [{ ...game, computed: { ...game.computed, originalTickets: 0 } }] };
        expect(prepareSnapshot(bad, null, [], now).excluded?.[0]?.reason).toContain("anchor unavailable");
        expect(prepareSnapshot({ ...data, games: [game, game] }, null, [], now).games).toHaveLength(0);
        expect(JSON.stringify(data)).toBe(before);
    });
    it("removes high confidence from failed sources and keeps actual snapshot timestamps", () => {
        const prepared = prepareSnapshot(data, { generatedAt: "2026-09-02T13:00:00Z", states: [{ state: "nc", ok: false }] }, [], now);
        expect(prepared.games).toHaveLength(0);
        expect(prepared.health?.importedAt).toBe(data.generatedAt);
        expect(prepared.health?.resultsAsOf).toBe("2026-09-01");
        expect(confidence(.5, prepared.health).level).toBe("low");
    });
    it("projects legacy reporting dates without rewriting history", () => {
        const history: History = { state: "nc", updatedAt: data.generatedAt, series: { "1": { name: "Test", price: 10, points: [{ date: "2026-09-02", ...game.computed }] } } };
        expect(reportingHistory(history)?.series["1"]?.points[0]).toMatchObject({ date: "2026-09-01", snapshotDate: "2026-09-02", dateBasis: "assumed-previous-day" });
        expect(history.series["1"]?.points[0]?.date).toBe("2026-09-02");
    });
    it("does not compute probabilities from partial odds or invalid denominators", () => {
        expect(profitOdds({ ...game, tiers: [...game.tiers, { amount: 50, originalCount: 2, remaining: 1 }] })).toBeNull();
        expect(liveTierOdds(1, 2)).toBeNull();
        expect(liveTierOdds(NaN, 2)).toBeNull();
        expect(liveTierOdds(100, 0)).toBeNull();
    });
    it("does not call multi-day or correction deltas daily prizes", () => {
        const point = { ...game.computed, tiers: game.tiers };
        const series = { name: "Test", price: 10, points: [{ date: "2026-09-01", ...point }, { date: "2026-09-03", ...point }] };
        expect(prizesWonPreviousDay(series)).toBeNull();
        expect(dailyBreakdown(series)).toEqual([]);
    });
});
