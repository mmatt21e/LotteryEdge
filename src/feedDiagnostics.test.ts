import { describe, it, expect } from "vitest";
import { observeContent, validateFullRecords } from "./feedDiagnostics.js";
import { collectionSummary } from "../shared/feedDiagnostics.js";
import { assertSourceAccess } from "../shared/sourceAccess.js";
import type { RawGame } from "./types.js";

const game: RawGame = { state: "id", gameId: "synthetic", name: "Fixture", price: 10,
  tiers: [{ amount: 100, originalCount: 100, remaining: 50, odds: 100 }] };
describe("collection coverage without relaxing EV guards", () => {
  it("distinguishes empty input from collected Iowa records all rejected", () => {
    expect(validateFullRecords([]).coverage).toMatchObject({ validation: "empty", sourceRecordCount: 0 });
    const raw = Array.from({length: 50}, (_, i) => ({...game, state: "ia", gameId: String(i)}));
    const before = JSON.stringify(raw), result = validateFullRecords(raw);
    expect(result.coverage).toEqual({ sourceRecordCount: 50, validatedCount: 0, excludedCount: 50, validation: "all-excluded" });
    expect(result.excluded.every(e => e.reason.includes("complete-ladder"))).toBe(true);
    expect(JSON.stringify(raw)).toBe(before);
    expect(collectionSummary([{ok: true, coverage: result.coverage}, {ok: false}])).toEqual({collectedCount: 1, usableCount: 0, zeroUsableCount: 1});
  });
  it("keeps distinct RI same-value rows excluded instead of silently summing them", () => {
    const result = validateFullRecords([{ ...game, state: "ri", tiers: [...game.tiers, {...game.tiers[0]!, originalCount: 40, remaining: 10}] }]);
    expect(result.coverage.validation).toBe("all-excluded");
    expect(result.excluded[0]?.reason).toContain("Duplicate prize tiers");
  });
  it("reports partial usable coverage without changing a supported estimate", () => {
    const result = validateFullRecords([game, {...game, gameId: "bad", tiers: [{...game.tiers[0]!, remaining: 101}]}]);
    expect(result.coverage).toEqual({sourceRecordCount: 2, validatedCount: 1, excludedCount: 1, validation: "partial"});
    expect(result.games[0]?.computed.evPerTicket).toBe(1);
  });
  it.each(["ar", "ct", "ok"])("preserves the %s access pause", state => expect(() => assertSourceAccess(state)).toThrow());
});
describe("raw content observations", () => {
  it("counts six identical Idaho observations as five comparisons without inventing a source date", () => {
    let observation = observeContent([game], "2026-10-12T11:00:00Z");
    for (let day = 13; day <= 17; day++) observation = observeContent([game], `2026-10-${day}T11:00:00Z`, observation);
    expect(observation).toMatchObject({unchangedRuns: 5, contentObservedSince: "2026-10-12T11:00:00Z"});
    expect(observation).not.toHaveProperty("sourceAsOf");
    expect(observeContent([{...game, tiers: [{...game.tiers[0]!, remaining: 49}]}], "2026-10-18T11:00:00Z", observation)).toMatchObject({unchangedRuns: 0, contentObservedSince: "2026-10-18T11:00:00Z"});
  });
  it("ignores ordering but preserves duplicated tier rows in the content hash", () => {
    const second = {...game, gameId: "second"}, first = observeContent([game, second], "2026-10-12T11:00:00Z");
    expect(observeContent([second, game], "2026-10-13T11:00:00Z", first).unchangedRuns).toBe(1);
    expect(observeContent([{...game, tiers: [...game.tiers, ...game.tiers]}, second], "2026-10-13T11:00:00Z", first).unchangedRuns).toBe(0);
  });
});
