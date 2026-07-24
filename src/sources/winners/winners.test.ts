import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseScWinners } from "./sc.js";
import { parseMoWinners, unzip } from "./mo.js";
import { parseLaDetail, parseUsDate } from "./la.js";
import { parseNcArticle } from "./nc.js";
import { parseGaArticle } from "./ga.js";
import { parseMsPosts } from "./ms.js";
import { parseArArticle } from "./ar.js";

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

describe("parseNcArticle", () => {
  const path = "/News/2026/7/14/Iredell-County-man-pockets-200000-top-prize";

  it("extracts the winner from a press-release article", () => {
    const w = parseNcArticle(fixture("nc-winner-article.html").toString("utf8"), path)!;
    expect(w).not.toBeNull();
    expect(w.game).toBe("5 Times Lucky");
    expect(w.prize).toBe(200_000);
    expect(w.retailer).toBe("Speedy Gas");
    expect(w.address).toBe("Salisbury Road");
    expect(w.city).toBe("Statesville");
    expect(w.player).toBe("Ray White");
    expect(w.date).toBe("2026-07-14"); // from the article URL
    expect(w.id).toBe("Iredell-County-man-pockets-200000-top-prize");
    expect(w.scratch).toBe(true);
  });

  it("returns null for non-winner articles", () => {
    expect(parseNcArticle("<html><body><main>Jackpot rises</main></body></html>", path)).toBeNull();
    expect(parseNcArticle("", path)).toBeNull();
  });

  it("recovers the game when the sale sentence only says 'lucky ticket'", () => {
    const html =
      "<html><body><main>Kelvin Lee of Jacksonville tried his luck on a $1 Cash 5 " +
      "ticket on Saturday and won a $130,000 jackpot. Lee bought his lucky ticket " +
      "from the Circle K on Pine Valley Road in Jacksonville.</main></body></html>";
    const w = parseNcArticle(html, "/News/2026/7/13/Onslow-County-man-wins-130000-jackpot-prize")!;
    expect(w.game).toBe("Cash 5");
    expect(w.retailer).toBe("Circle K"); // prose "the" stripped
    expect(w.prize).toBe(130_000);
    expect(w.scratch).toBe(false); // Cash 5 is a draw game
  });
});

describe("parseGaArticle", () => {
  const path = "/content/portal/en/media-center/pressreleaseinput/2026/july/players-win-huge.html";
  const winners = parseGaArticle(fixture("ga-winners-roundup.html").toString("utf8"), path);

  it("extracts a known scratcher winner exactly", () => {
    const w = winners.find((x) => x.retailer === "Publix Super Market #1087")!;
    expect(w.game).toBe("50X The Money");
    expect(w.prize).toBe(1_000_000); // "$1 million"
    expect(w.address).toBe("840 Glynn St");
    expect(w.city).toBe("Fayetteville");
    expect(w.date).toBe("2026-06-22"); // "claimed June 22" + dateline year
    expect(w.id).toBe(`${path}#0`);
    expect(w.scratch).toBe(true);
  });

  it("keeps only wins naming game AND retailer", () => {
    expect(winners.length).toBeGreaterThanOrEqual(2);
    for (const w of winners) {
      expect(w.game).toMatch(/\S/);
      expect(w.retailer).toMatch(/\S/);
      expect(w.prize).toBeGreaterThan(0);
    }
  });

  it("names draw games from the drawing sentence and flags them", () => {
    const f5 = winners.find((x) => x.game === "Fantasy 5")!;
    expect(f5.prize).toBe(125_000);
    expect(f5.retailer).toBe("QuikTrip #0825");
    expect(f5.scratch).toBe(false);
  });

  it("yields nothing on garbage input", () => {
    expect(parseGaArticle("<html><body><p>no winners in this text</p></body></html>", path)).toEqual([]);
  });
});

describe("parseMsPosts", () => {
  const winners = parseMsPosts(JSON.parse(fixture("ms-winner-posts.json").toString("utf8")));

  it("extracts a single-story winner (top prize + purchased at)", () => {
    const w = winners.find((x) => x.id === "69212:0")!;
    expect(w.game).toBe("Millionaire Maker");
    expect(w.prize).toBe(1_000_000); // "$1 million"
    expect(w.retailer).toBe("Keith’s Superstore #89");
    expect(w.city).toBe("Ocean Springs");
    expect(w.date).toBe("2026-06-26");
    expect(w.scratch).toBe(true);
  });

  it("extracts every 2nd-chance roundup winner with game, prize, retailer", () => {
    const roundup = winners.filter((w) => w.id!.startsWith("69627:"));
    expect(roundup.length).toBeGreaterThanOrEqual(4);
    const first = roundup[0]!;
    expect(first.game).toBe("My Lottery Dream Home");
    expect(first.prize).toBe(1_000_000);
    expect(first.retailer).toBe("Fleet Way #143");
    for (const w of winners) {
      expect(w.game).toMatch(/\S/);
      expect(w.retailer).toMatch(/\S/);
      expect(w.prize).toBeGreaterThan(0);
    }
  });

  it("yields nothing on empty/garbage posts", () => {
    expect(parseMsPosts([])).toEqual([]);
    expect(
      parseMsPosts([
        {
          id: 1,
          date: "2026-01-01T00:00:00",
          slug: "x",
          link: "",
          title: { rendered: "x" },
          content: { rendered: "<p>jackpot news with no winners</p>" },
        },
      ]),
    ).toEqual([]);
  });
});

describe("parseArArticle", () => {
  const path = "/press-release/winner-round-arkansas-lottery-players-score-summer-wins-scratch-tickets";
  const winners = parseArArticle(fixture("ar-winner-roundup.html").toString("utf8"), path);

  it("extracts a known round-up winner exactly", () => {
    const w = winners.find((x) => x.game === "Diamonds & Gold")!;
    expect(w.prize).toBe(200_000);
    expect(w.retailer).toBe("Jordan’s Kwik Stop #64");
    expect(w.address).toBe("19888 Highway 18 E.");
    expect(w.city).toBe("Monette");
    expect(w.player).toBe("R. Sorrells");
    expect(w.date).toBe("2026-07-23"); // article date
    expect(w.scratch).toBe(true);
  });

  it("pairs each win with its own retailer sentence", () => {
    expect(winners).toHaveLength(3);
    expect(winners.map((w) => w.retailer)).toEqual([
      "Jordan’s Kwik Stop #64",
      "Doublebees #142",
      "Maverik #5273",
    ]);
    // Games holding dollar amounts survive the comma-aware game regex.
    expect(winners[1]!.game).toBe("$100,000 Platinum Crossword");
    expect(winners[1]!.prize).toBe(100_000);
  });

  it("yields nothing without the Drupal body div", () => {
    expect(parseArArticle("<html><body>no body div</body></html>", path)).toEqual([]);
    expect(parseArArticle("", path)).toEqual([]);
  });
});
