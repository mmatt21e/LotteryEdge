import {afterEach, describe, expect, it, vi} from "vitest";
import {neReportingDate} from "./ne-reporting.js";
import {parseNePdf, scrapeNe} from "./ne.js";

afterEach(() => vi.unstubAllGlobals());
describe("Nebraska results dates", () => {
  it.each([
    ["2026-09-02T12:00:00Z", "2026-09-01"],
    ["2026-09-02T01:00:00Z", "2026-08-31"],
    ["2026-03-09T05:30:00Z", "2026-03-08"],
    ["2026-11-02T06:30:00Z", "2026-11-01"],
    ["2027-01-01T12:00:00Z", "2026-12-31"],
  ])("uses the previous local calendar date for %s", (at, expected) => {
    expect(neReportingDate(at)).toEqual({resultsAsOf:expected,dateBasis:"assumed-previous-day",timeZone:"America/Chicago"});
  });
  it("prefers an explicit report date", () => {
    expect(neReportingDate("2026-10-05T15:54:28.275Z", "2026-10-04")).toMatchObject({sourceAsOf:"2026-10-04",resultsAsOf:"2026-10-04",dateBasis:"source"});
  });
  it("rejects invalid and future source dates instead of inventing freshness", () => {
    for (const date of ["2026-02-30", "2026-10-06", "bad"])
      expect(() => neReportingDate("2026-10-05T15:00:00Z", date)).toThrow();
    expect(() => neReportingDate("bad")).toThrow();
  });
});
describe("Nebraska source failure gates", () => {
  it("rejects HTTP failure without parsing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("blocked", {status:403})));
    await expect(scrapeNe()).rejects.toThrow("HTTP 403");
  });
  it("rejects HTML in place of a PDF", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>changed</html>")));
    await expect(scrapeNe()).rejects.toThrow("did not return a PDF");
  });
  it("rejects oversized input before starting Python", async () => {
    await expect(parseNePdf(new Uint8Array(12*1024*1024+1))).rejects.toThrow("size limit");
  });
});
