import { it, expect, vi } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawGame } from "./types.js";

// Exercise the real collector orchestration with an in-memory filesystem and
// synthetic adapters. No original data path is ever read or written.
const mock = vi.hoisted(() => ({files: new Map<string, string>(), sources: new Map<string, any>()}));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async (path: string) => { if (!mock.files.has(path)) throw Error("ENOENT"); return mock.files.get(path)!; }),
  writeFile: vi.fn(async (path: string, body: string, options?: {flag?: string}) => {
    if (options?.flag === "wx" && mock.files.has(path)) throw Error("EEXIST");
    mock.files.set(path, String(body));
  }),
}));
vi.mock("./sources/registry.js", () => ({sourceKeys: () => [...mock.sources.keys()], getSource: (key: string) => mock.sources.get(key)}));
vi.mock("./sources/winners/registry.js", () => ({WINNER_SOURCES: []}));

it("archives all-excluded observations, retains prior bytes, and never calls paused adapters", async () => {
  const directory = fileURLToPath(new URL("../data/", import.meta.url));
  const path = (name: string) => resolve(directory, name);
  const game: RawGame = {state: "ia", gameId: "fixture", name: "Fixture", price: 10, tiers: [{amount: 100, originalCount: 100, remaining: 50, odds: 100}]};
  const prior = JSON.stringify({state: "ia", generatedAt: "2026-10-16T11:00:00Z", source: "fixture", games: [], gameCount: 0, excluded: [{gameId: "old", name: "Old", reason: "Unsupported"}]});
  const history = JSON.stringify({state: "ia", updatedAt: "2026-10-16T11:00:00Z", series: {old: {name: "Old", price: 1, points: [{date: "2026-10-16", ticketsRemaining: 100, roi: .5, topPrizesRemaining: 1, fractionRemaining: .5, remainingPrizeValue: 50}]}}});
  mock.files.set(path("scratchers-ia.json"), prior);
  mock.files.set(path("history-ia.json"), history);
  mock.sources.set("ia", {key: "ia", kind: "full", scrape: vi.fn(async () => ({source: "fixture", games: [game]}))});
  const paused = vi.fn(() => {throw Error("Must not contact paused source");});
  for (const key of ["ar", "ct", "ok"]) mock.sources.set(key, {key, kind: "full", scrape: paused});
  mock.sources.set("zz", {key: "zz", kind: "full", scrape: vi.fn(async () => ({source: "fixture", games: []}))});
  mock.files.set(path("scratchers-zz.json"), prior);
  const originalArgv = process.argv, originalExit = process.exitCode;
  process.argv = [process.argv[0]!, "fixture", "all"];
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("Network disabled in regression"));
  try {
    await import("./index.js");
    await vi.waitFor(() => expect(mock.files.has(path("status.json"))).toBe(true), {timeout: 5000});
    await new Promise<void>(done => setImmediate(done));
    const status = JSON.parse(mock.files.get(path("status.json"))!);
    expect(status).toMatchObject({collectedCount: 1, usableCount: 0, zeroUsableCount: 1, failed: ["ar", "ct", "ok", "zz"], stale: [], staleRuns: {}});
    expect(mock.files.get(path("scratchers-zz.json"))).toBe(prior);
    expect(status.states.find((s: any) => s.state === "zz").error).toContain("Empty source listing");
    expect(status.states.find((s: any) => s.state === "ia")).toMatchObject({ok: true, coverage: {sourceRecordCount: 1, validatedCount: 0, excludedCount: 1, validation: "all-excluded"}});
    expect([...mock.files.entries()].find(([p]) => p.endsWith("-previous-published.json"))?.[1]).toBe(prior);
    expect([...mock.files.entries()].find(([p]) => p.endsWith("-previous-history.json"))?.[1]).toBe(history);
    expect(JSON.parse(mock.files.get(path("history-ia.json"))!).series.old.points).toEqual(JSON.parse(history).series.old.points);
    expect([...mock.files.entries()].some(([p, body]) => p.includes("observations-v1") && JSON.parse(body).raw?.[0]?.gameId === "fixture")).toBe(true);
    expect(paused).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    process.argv = originalArgv; process.exitCode = originalExit;
    log.mockRestore(); error.mockRestore(); warn.mockRestore(); fetch.mockRestore();
  }
});
