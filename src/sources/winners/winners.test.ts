import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseScWinners } from "./sc.js";
import { parseMoWinners, unzip } from "./mo.js";
import { parseLaDetail, parseUsDate } from "./la.js";

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url)));

describe("parseScWinners", () => {
  const winners = parseScWinners(fixture("sc-winners-report.html").toString("utf8"));

  it("parses every data row with full retailer detail", () => {
    expect(winners).toHaveLength(6);
    for (const w of winners) {
      expect(w.retailer).toMatch(/\S/);
      expect(w.prize).toBeGreaterThan(0);
      expect(w.city).toBeTruthy();
      expect(w.address).toBeTruthy();
      expect(w.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("extracts a known row exactly and flags draw games", () => {
    const pick3 = winners.find((w) => w.game === "Pick 3")!;
    expect(pick3.prize).toBe(750);
    expect(pick3.retailer).toBe("Circle K Stores #2708110");
    expect(pick3.city).toBe("Goose Creek");
    expect(pick3.date).toBe("2026-07-22");
    expect(pick3.scratch).toBe(false);
    // ALL-CAPS instant games count as scratchers.
    const scratch = winners.filter((w) => w.scratch);
    expect(scratch.length).toBeGreaterThan(0);
  });
});

describe("parseMoWinners (xlsx)", () => {
  const winners = parseMoWinners(fixture("mo-monthly-winners.xlsx"));

  it("reads the whole monthly sheet", () => {
    expect(winners.length).toBeGreaterThan(1500);
    for (const w of winners.slice(0, 50)) {
      expect(w.retailer).toMatch(/\S/);
      expect(w.prize).toBeGreaterThan(0);
    }
  });

  it("extracts a known row with address and month date", () => {
    const w = winners.find((x) => x.retailer === "GARDEN INN TRUCK STOP")!;
    expect(w.game).toBe("40TH ANNIVERSARY");
    expect(w.prize).toBe(2_000_000);
    expect(w.city).toBe("CABOOL");
    expect(w.address).toBe("14081 HIGHWAY 60");
    expect(w.date).toBe("2026-06-01"); // month granularity
    expect(w.scratch).toBe(true);
  });

  it("flags draw games", () => {
    const draw = winners.find((x) => x.game === "SHOW ME CASH");
    expect(draw?.scratch).toBe(false);
  });

  it("unzip rejects non-zip input", () => {
    expect(() => unzip(Buffer.from("not a zip at all"))).toThrow(/not a ZIP/);
  });
});

describe("parseLaDetail", () => {
  const item = {
    id: 82776,
    date: "2026-05-28T08:35:32",
    slug: "brandon-webb",
    link: "https://louisianalottery.com/winner/brandon-webb/",
    title: { rendered: "Brandon Webb" },
  };

  it("extracts the labeled fields from a winner page", () => {
    const w = parseLaDetail(fixture("la-winner-detail.html").toString("utf8"), item)!;
    expect(w).not.toBeNull();
    expect(w.game).toBe("$500,000 Extreme Cash");
    expect(w.gameId).toBe("1657");
    expect(w.prize).toBe(10_000);
    expect(w.retailer).toBe("PAL 1972 LLC");
    expect(w.player).toBe("Brandon Webb");
    expect(w.date).toBe("2026-05-26");
    expect(w.id).toBe("82776");
    expect(w.scratch).toBe(true);
  });

  it("returns null when the fields are missing", () => {
    expect(parseLaDetail("<html><body>nothing here</body></html>", item)).toBeNull();
  });

  it("parseUsDate handles US long dates", () => {
    expect(parseUsDate("May 26, 2026")).toBe("2026-05-26");
    expect(parseUsDate("garbage")).toBeUndefined();
  });
});
