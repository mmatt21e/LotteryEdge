import { describe, it, expect } from "vitest";
import {
  usd,
  usd2,
  usdCompact,
  pct,
  int,
  compact,
  netPerDollar,
  centsPerDollar,
  shortDay,
  relativeTime,
} from "./format.js";

describe("currency & number formats", () => {
  it("formats whole and cent dollars", () => {
    expect(usd(1234)).toBe("$1,234");
    expect(usd2(1.5)).toBe("$1.50");
  });
  it("compacts large figures", () => {
    // ICU versions differ on whether a whole compact keeps ".0" ($2M vs $2.0M).
    expect(usdCompact(2_000_000)).toMatch(/^\$2(\.0)?M$/);
    expect(usdCompact(25_000)).toMatch(/^\$25(\.0)?K$/);
    expect(compact(1_535_558)).toBe("1.5M");
    expect(compact(397)).toBe("397");
  });
  it("percents and ints", () => {
    expect(pct(0.5)).toBe("50%");
    expect(pct(0.1234, 1)).toBe("12.3%");
    expect(int(1234.6)).toBe("1,235");
  });
});

describe("net per dollar", () => {
  it("converts roi to signed cents", () => {
    expect(netPerDollar(0.933)).toBeCloseTo(-0.067, 10);
    expect(centsPerDollar(-0.067)).toBe("−6.7¢");
    expect(centsPerDollar(0.03)).toBe("+3.0¢");
    expect(centsPerDollar(0)).toBe("0.0¢");
  });
});

describe("dates", () => {
  it("shortDay parses date-only strings as local time", () => {
    expect(shortDay("2026-07-16")).toBe("Jul 16");
  });
  it("relativeTime floors at 'just now' and never goes negative", () => {
    expect(relativeTime(new Date().toISOString())).toBe("just now");
    expect(relativeTime(new Date(Date.now() + 60_000).toISOString())).toBe("just now");
    expect(relativeTime(new Date(Date.now() - 3 * 86_400_000).toISOString())).toBe("3 days ago");
  });
});
