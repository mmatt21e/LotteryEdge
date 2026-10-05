import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseGa } from "./ga.js";
describe("GA display-dollar source", () => {
    it("reads official #1423 as $3m without scaling prices or reviving absent games", () => {
        const parsed = parseGa(readFileSync(new URL("./fixtures/ga-published.html", import.meta.url), "utf8"));
        expect(parsed.games.find(g => g.gameId === "1423")).toMatchObject({ price: 20, topPrizeValue: 3000000 });
        expect(parsed.games.find(g => g.gameId === "1888")).toMatchObject({ price: 20, topPrizeValue: 2500000 });
        expect(parsed.games.find(g => g.gameId === "1737")).toMatchObject({ price: 30, topPrizeValue: 7000000 });
        expect(parsed.games.find(g => g.gameId === "1800")).toBeUndefined(); // absent from this published table; do not guess a correction
        expect(parsed.sourceAsOf).toBe("2026-09-27");
        expect(new Set(parsed.games.map(g => g.gameId)).size).toBe(parsed.games.length);
    });
    it("preserves noncash descriptions and refuses retired/missing tables", () => {
        const rows = [{ gameId: "a", gameName: "Life", ticketPrice: "$5", topPrize: "$1,000 a Month for Life", claimed: "1", total: "2" }];
        expect(parseGa(`topPrizListArray: JSON.stringify(${JSON.stringify(rows)})`).games[0]).toMatchObject({ topPrize: rows[0]!.topPrize, topPrizeValue: null });
        expect(() => parseGa('{"prizeAmount":30000000000}')).toThrow(/table unavailable/);
    });
});
