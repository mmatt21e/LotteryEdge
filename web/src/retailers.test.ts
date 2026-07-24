import { describe, it, expect } from "vitest";
import { aggregateRetailers, sortRetailers, winnersForGame } from "./retailers.js";
import type { WinnerRecord } from "./types.js";

const W = (over: Partial<WinnerRecord>): WinnerRecord => ({
  game: "Lucky 7s",
  prize: 1000,
  retailer: "Quick Mart",
  city: "Raleigh",
  ...over,
});

describe("aggregateRetailers", () => {
  it("groups by retailer+city, case/punctuation-insensitively", () => {
    const list = aggregateRetailers([
      W({ prize: 500, date: "2026-07-01" }),
      W({ retailer: "QUICK-MART", prize: 2000, date: "2026-07-10", game: "Big Cash" }),
      W({ retailer: "Quick Mart", city: "Durham", prize: 100 }),
    ]);
    expect(list).toHaveLength(2);
    const raleigh = list.find((r) => r.city === "Raleigh")!;
    expect(raleigh.wins).toBe(2);
    expect(raleigh.totalPrize).toBe(2500);
    expect(raleigh.maxPrize).toBe(2000);
    expect(raleigh.lastDate).toBe("2026-07-10");
    expect(raleigh.games).toEqual(["Lucky 7s", "Big Cash"]);
  });

  it("skips records without a retailer", () => {
    expect(aggregateRetailers([W({ retailer: "" })])).toHaveLength(0);
  });
});

describe("sortRetailers", () => {
  const list = aggregateRetailers([
    W({ retailer: "A", prize: 100, date: "2026-07-01" }),
    W({ retailer: "A", prize: 100, date: "2026-07-02" }),
    W({ retailer: "A", prize: 100, date: "2026-07-03" }),
    W({ retailer: "B", prize: 50_000, date: "2026-06-01" }),
    W({ retailer: "C", prize: 400, date: "2026-07-20" }),
  ]);
  const names = (s: Parameters<typeof sortRetailers>[1]) =>
    sortRetailers(list, s).map((r) => r.retailer);

  it("by wins", () => expect(names("wins")[0]).toBe("A"));
  it("by total $", () => expect(names("total")[0]).toBe("B"));
  it("by biggest win", () => expect(names("biggest")[0]).toBe("B"));
  it("by most recent", () => expect(names("recent")[0]).toBe("C"));
});

describe("winnersForGame", () => {
  it("matches on normalized game name, newest first", () => {
    const winners = [
      W({ game: "$1,000,000 Triple Play", date: "2026-07-01", prize: 5000 }),
      W({ game: "1000000 TRIPLE PLAY!", date: "2026-07-15", prize: 1000 }),
      W({ game: "Other Game", date: "2026-07-10" }),
    ];
    const hits = winnersForGame(winners, "$1,000,000 Triple Play");
    expect(hits).toHaveLength(2);
    expect(hits[0]!.date).toBe("2026-07-15");
  });

  it("empty for blank names", () => {
    expect(winnersForGame([W({})], "")).toEqual([]);
  });
});
