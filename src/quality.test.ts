import { describe, it, expect } from "vitest";
import { reportingDate, feedHealth, freshnessRange, computedIssues } from "../shared/quality.js";
import { computeStats } from "./ev.js";
import type { RawGame } from "./types.js";
import auditedInvalid from "./fixtures/audited-invalid-games.json";
describe("reporting dates", () => {
    it.each([
        ["2026-09-02T12:00:00Z", "nc", "2026-09-01"],
        ["2026-10-01T12:00:00Z", "nc", "2026-09-30"],
        ["2027-01-01T12:00:00Z", "nc", "2026-12-31"],
        ["2026-03-09T04:30:00Z", "nc", "2026-03-08"],
        ["2026-11-02T05:30:00Z", "nc", "2026-11-01"],
        ["2026-09-02T01:00:00Z", "ca", "2026-08-31"],
    ])("previous local calendar day for %s %s", (at, state, expected) => expect(reportingDate(at, state)).toMatchObject({ resultsAsOf: expected, dateBasis: "assumed-previous-day" }));
    it("explicit source date takes precedence without changing import time", () => {
        expect(reportingDate("2026-09-02T12:00:00Z", "ga", "2026-08-30")).toMatchObject({ resultsAsOf: "2026-08-30", dateBasis: "source" });
        expect(() => reportingDate("2026-09-02T12:00:00Z", "ga", "2026-09-03")).toThrow();
        expect(() => reportingDate("2026-09-02T12:00:00Z", "ga", "2026-02-30")).toThrow();
    });
    it("failed attempts retain old dates and cannot make old data fresh", () => {
        const f = feedHealth({ state: "ar", source: "official", generatedAt: "2026-09-02T12:00:00Z" }, { generatedAt: "2026-10-05T12:00:00Z", states: [{ state: "ar", ok: false, error: "403" }] }, Date.parse("2026-10-05T14:00:00Z"));
        expect(f).toMatchObject({ eligible: false, resultsAsOf: "2026-09-01", importedAt: "2026-09-02T12:00:00Z" });
        expect(f.reasons.join()).toContain("403");
    });
    it("reports a range instead of the newest date for every state", () => {
        const now = Date.parse("2026-09-02T14:00:00Z");
        const feeds = ["2026-09-02T12:00:00Z", "2026-09-01T12:00:00Z", "2026-08-20T12:00:00Z"].map(generatedAt => feedHealth({ state: "nc", source: "official", generatedAt }, null, now));
        expect(freshnessRange(feeds)).toEqual({ oldest: "2026-08-31", newest: "2026-09-01" });
    });
});
const game: RawGame = { state: "oh", gameId: "test", name: "Test", price: 10, tiers: [{ amount: 100, originalCount: 100, remaining: 50, odds: 100 }] };
describe("invalid models", () => {
    it("rejects all five original audited OH/MA records", () => {
        expect(auditedInvalid).toHaveLength(5);
        for (const record of auditedInvalid) {
            expect(computedIssues(record)).not.toHaveLength(0);
            expect(() => computeStats(record)).toThrow();
        }
    });
    it("rejects OH remaining greater than original and missing MA anchors", () => {
        expect(() => computeStats({ ...game, tiers: [{ amount: 50000, originalCount: 6, remaining: 7, odds: 10000 }] })).toThrow(/exceeds original/);
        expect(() => computeStats({ ...game, tiers: [{ amount: 100, originalCount: 100, remaining: 50 }] })).toThrow(/anchor unavailable/);
    });
    it("rejects noncash, duplicate, NaN and impossible probability inputs", () => {
        for (const tiers of [[{ amount: 0, originalCount: 10, remaining: 5, odds: 100 }], [...game.tiers, ...game.tiers], [{ ...game.tiers[0]!, remaining: NaN }]])
            expect(() => computeStats({ ...game, tiers })).toThrow();
        const computed = computeStats(game);
        expect(computedIssues({ ...game, computed: { ...computed, ticketsRemaining: 1 } }).join()).toContain("smaller than");
    });
    it("keeps gross EV separate from net return and checks stored totals", () => {
        const computed = computeStats(game);
        expect(computed.evPerTicket).toBe(1);
        expect(computed.roi).toBe(.1);
        expect(computed.roi - 1).toBeCloseTo(-.9);
        expect(computedIssues({ ...game, computed: { ...computed, remainingPrizeValue: 999 } })).not.toHaveLength(0);
    });
    it("does not claim complete EV for the known $50+ Iowa partial ladder", () => expect(() => computeStats({ ...game, state: "ia" })).toThrow(/complete-ladder/));
});
