import { describe, expect, it } from "vitest";
import { pageIsHistoryTop, pageStackFromState } from "./Sheet.js";

describe("FullPage history state", () => {
  it("reads only valid page ids", () => {
    expect(pageStackFromState({ lotteryEdgePages: ["menu", 4, null, "info"] })).toEqual([
      "menu",
      "info",
    ]);
    expect(pageStackFromState(null)).toEqual([]);
  });

  it("identifies exactly the visible history level", () => {
    const nested = { lotteryEdgePages: ["menu", "info"] };
    expect(pageIsHistoryTop("info", nested)).toBe(true);
    expect(pageIsHistoryTop("menu", nested)).toBe(false);
    expect(pageIsHistoryTop("menu", { lotteryEdgePages: ["menu"] })).toBe(true);
    expect(pageIsHistoryTop("menu", {})).toBe(false);
  });
});
