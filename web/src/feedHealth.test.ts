import { describe, it, expect } from "vitest";
import { prepareSnapshot } from "./dataQuality.js";
import { feedHealthLabel } from "../../shared/quality.js";
import type { ScrapeResult, LiteResult, Game } from "./types.js";
const at = "2026-10-17T11:00:00Z", now = Date.parse("2026-10-18T02:55:00Z");
const game: Game = {state: "id", gameId: "one", name: "Fixture", price: 10,
  tiers: [{amount: 100, originalCount: 100, remaining: 50, odds: 100}],
  computed: {originalTickets: 10000, ticketsRemaining: 5000, fractionRemaining: .5, remainingPrizeValue: 5000, evPerTicket: 1, roi: .1, topPrizeAmount: 100, topPrizesRemaining: 50}};
const data: ScrapeResult = {state: "id", source: "official", generatedAt: at, gameCount: 1, games: [game]};
const status = {generatedAt: at, staleRuns: {id: 5, ia: 13, ri: 13}, states: [{state: "id", ok: true}, {state: "ia", ok: true}, {state: "ri", ok: true}]};
describe("usable coverage and honest freshness", () => {
  it.each([["ia", 50], ["ri", 75]] as const)("shows %s collection success separately from zero usable records", (state, count) => {
    const snapshot = {...data, state, gameCount: 0, games: [], excluded: Array.from({length: count}, (_, n) => ({gameId: String(n), name: "Rejected", reason: "Unsupported source data"}))};
    const before = JSON.stringify(snapshot), view = prepareSnapshot(snapshot, status, [], now);
    expect(view.health).toMatchObject({collectionStatus: "collected", eligible: false, coverage: {sourceRecordCount: count, validatedCount: 0, excludedCount: count, validation: "all-excluded"}});
    expect(feedHealthLabel(view.health!)).toBe("Current comparison unavailable");
    expect(view.health?.warnings).toEqual([]); // Empty output is not unchanged provider evidence.
    expect(view.excluded).toHaveLength(count);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it("distinguishes a truly empty legacy listing from all-excluded input", () => {
    const view = prepareSnapshot({...data, games: [], gameCount: 0}, status, [], now);
    expect(view.health?.coverage?.validation).toBe("empty");
    expect(view.health?.reasons.join()).toContain("No source records collected");
  });
  it("labels legacy Idaho no-change counters honestly without fabricating a source date or removing valid estimates", () => {
    const view = prepareSnapshot(data, status, [], now);
    expect(view.games).toHaveLength(1);
    expect(view.health).toMatchObject({eligible: true, resultsAsOf: "2026-10-16", dateBasis: "assumed-previous-day", importedAt: at});
    expect(view.health?.warnings?.join()).toContain("legacy comparison, not a raw-content check");
    expect(feedHealthLabel(view.health!)).toBe("Data unchanged; provider freshness unconfirmed");
    expect(view.sourceAsOf).toBeUndefined();
  });
  it("uses raw observation metadata when available and ignores unrelated older status", () => {
    const view = prepareSnapshot({...data, observation: {contentHash: "fixture", unchangedRuns: 5, contentObservedSince: "2026-10-12T11:00:00Z"}}, {...status, generatedAt: "2026-10-16T11:00:00Z"}, [], now);
    expect(view.health?.warnings?.join()).toContain("Collected content unchanged for 5");
    expect(view.health?.warnings?.join()).not.toContain("legacy");
    expect(view.health?.collectionStatus).toBe("unknown");
    expect(prepareSnapshot(data, {...status, generatedAt: "2026-10-16T11:00:00Z"}, [], now).health?.warnings).toEqual([]);
  });
  it.each(["ne", "ga"])("keeps %s's October 11 official date stale despite an October 17 import", state => {
    const snapshot: LiteResult = {state, source: "official", sourceAsOf: "2026-10-11", generatedAt: at, validationVersion: "2026-10-05.1", limited: true, gameCount: 1, games: [{gameId: "1423", name: "Fixture", price: 20, topPrize: "$3,000,000", topPrizeValue: 3000000, closingSoon: false}]};
    const view = prepareSnapshot(snapshot, {generatedAt: at, states: [{state, ok: true}]}, [], now);
    expect(view.health).toMatchObject({eligible: false, resultsAsOf: "2026-10-11", dateBasis: "source", coverage: {validation: "usable", validatedCount: 1}});
    expect(view.health?.reasons.join()).toContain("older than two calendar days");
    expect(view.games).toHaveLength(1); // Historical lite facts remain accessible.
  });
  it.each(["ar", "ct", "ok"])("does not let new status fields unpause %s", state => {
    const view = prepareSnapshot({...data, state, games: [{...game, state}]}, {generatedAt: at, states: [{state, ok: true}]}, [], now);
    expect(view.health).toMatchObject({eligible: false, collectionStatus: "paused"});
    expect(view.games).toHaveLength(0);
  });
  it("does not let claimed coverage metadata bypass actual model validation", () => {
    const view = prepareSnapshot({...data, games: [{...game, computed: {...game.computed, evPerTicket: 999}}], coverage: {sourceRecordCount: 1, validatedCount: 1, excludedCount: 0, validation: "usable"}}, status, [], now);
    expect(view.health?.coverage?.validation).toBe("all-excluded");
    expect(view.games).toHaveLength(0);
  });
});
