import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { RawGame } from "../types.js";
import { parseNc } from "./nc.js";
import { parseMa, buildOddsMap, parseOdds } from "./ma.js";
import { parseCaTiers } from "./ca.js";
import { buildMiGames } from "./mi.js";

// Fixtures are trimmed captures of the real sources (see the comment in each
// file for what/when). They pin the parsers against the markup/shape they were
// written for, so a refactor that changes parsing behavior fails here instead
// of in the nightly run.
const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");
const jsonFixture = <T>(name: string): T => JSON.parse(fixture(name)) as T;

/** Invariants every published full-EV game must satisfy, whatever the state. */
function assertValidGames(games: RawGame[], state: string) {
  expect(games.length).toBeGreaterThan(0);
  for (const g of games) {
    expect(g.state).toBe(state);
    expect(g.gameId).toMatch(/\S/);
    expect(g.name).toMatch(/\S/);
    expect(Number.isFinite(g.price) && g.price > 0, `${g.name}: bad price ${g.price}`).toBe(true);
    expect(g.tiers.length).toBeGreaterThan(0);
    for (const t of g.tiers) {
      expect(Number.isFinite(t.amount) && t.amount > 0, `${g.name}: bad amount`).toBe(true);
      expect(Number.isFinite(t.originalCount), `${g.name}: bad originalCount`).toBe(true);
      expect(Number.isFinite(t.remaining), `${g.name}: bad remaining`).toBe(true);
      expect(t.remaining, `${g.name}: remaining > originalCount`).toBeLessThanOrEqual(
        t.originalCount,
      );
      expect(t.remaining).toBeGreaterThanOrEqual(0);
    }
  }
}

describe("parseNc", () => {
  const games = parseNc(fixture("nc-prizes-remaining.html"));

  it("parses every game box with sane values", () => {
    expect(games).toHaveLength(3);
    assertValidGames(games, "nc");
  });

  it("extracts a known game exactly", () => {
    const g = games[0]!;
    expect(g.gameId).toBe("996");
    expect(g.name).toBe("$1,000,000 Triple Play");
    expect(g.price).toBe(10); // from the price_10 container class
    expect(g.url).toBe("https://nclottery.com/scratch-off/996/1000000-triple-play");
    expect(g.tiers).toHaveLength(11);
    // Top tier: $1,000,000 · odds 1 in 1,469,394 · 4 of 5 remaining.
    expect(g.tiers[0]).toEqual({
      amount: 1_000_000,
      odds: 1_469_394,
      originalCount: 5,
      remaining: 4,
    });
  });

  it("returns no games for unrelated markup", () => {
    expect(parseNc("<html><body><div class='databox'>no game here</div></body></html>")).toEqual(
      [],
    );
  });
});

describe("parseMa", () => {
  type MaPrizes = Parameters<typeof parseMa>[0];
  type MaMeta = Parameters<typeof buildOddsMap>[0];
  const raw = jsonFixture<MaPrizes>("ma-instant-game-prizes.json");
  const oddsById = buildOddsMap(jsonFixture<MaMeta>("ma-games-meta.json"));

  it("parses odds strings", () => {
    expect(parseOdds("1 in 4.13")).toBe(4.13);
    expect(parseOdds("Overall Odds: 1 in 3.5")).toBe(3.5);
    expect(parseOdds(null)).toBeUndefined();
    expect(parseOdds("no odds here")).toBeUndefined();
  });

  it("drops effectively sold-out games (<5% of prizes remaining)", () => {
    // The fixture holds 4 games; three sit at 1–4% remaining and must be
    // dropped by the sold-out guard, leaving only $4,000,000 JUMBO CASH (28%).
    const games = parseMa(raw, oddsById);
    expect(games.map((g) => g.gameId)).toEqual(["341"]);
    assertValidGames(games, "ma");
  });

  it("joins the overall-odds anchor by massGameID", () => {
    const g = parseMa(raw, oddsById)[0]!;
    expect(g.name).toBe("$4,000,000 JUMBO CASH");
    expect(g.price).toBe(10);
    expect(g.overallOdds).toBe(4.01);
    expect(g.url).toBe("https://www.masslottery.com/games/scratch-tickets/4M-jumbo-cash-2022");
    // Per-tier odds are never fabricated for MA.
    for (const t of g.tiers) expect(t.odds).toBeUndefined();
  });

  it("leaves games without a published odds anchor un-anchored", () => {
    const g = parseMa(raw, new Map())[0]!;
    expect(g.overallOdds).toBeUndefined();
  });
});

describe("parseCaTiers", () => {
  it("parses the detail-page prize table", () => {
    const tiers = parseCaTiers(fixture("ca-detail.html"));
    // The fixture table has 11 body rows; the non-dollar "Ticket" (free ticket)
    // row is dropped because its amount isn't numeric.
    expect(tiers).toHaveLength(10);
    for (const t of tiers) {
      expect(Number.isFinite(t.amount) && t.amount > 0).toBe(true);
      expect(t.remaining).toBeLessThanOrEqual(t.originalCount);
    }
    // Top row: "$5,000,000 | 1 in 2,400,000 | 7 of 7".
    expect(tiers[0]).toEqual({
      amount: 5_000_000,
      odds: 2_400_000,
      originalCount: 7,
      remaining: 7,
    });
  });

  it("returns no tiers for unrelated markup", () => {
    expect(parseCaTiers("<html><body><table><tr><td>x</td></tr></table></body></html>")).toEqual(
      [],
    );
  });
});

describe("buildMiGames", () => {
  type Lobby = Parameters<typeof buildMiGames>[0];
  type Prizes = Parameters<typeof buildMiGames>[1];
  const lobby = jsonFixture<Lobby>("mi-lobby.json");
  const prizes = jsonFixture<Prizes>("mi-prizes.json");

  it("joins lobby meta with prize data on igtId", () => {
    const games = buildMiGames(lobby, prizes);
    expect(games).toHaveLength(4);
    assertValidGames(games, "mi");

    const g = games.find((x) => x.gameId === "747")!;
    expect(g.name).toBe("In The Money");
    expect(g.price).toBe(5); // "$5.00"
    expect(g.overallOdds).toBe(4.13); // "1 in 4.13"
    expect(g.tiers.length).toBe(12);
    expect(g.tiers[0]).toEqual({ amount: 5, originalCount: 629552, remaining: 588873 });
  });

  it("skips prize entries with no lobby anchor", () => {
    expect(buildMiGames([], prizes)).toEqual([]);
  });
});
