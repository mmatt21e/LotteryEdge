import {afterEach,describe,expect,it,vi} from "vitest";
import {scrapeAr} from "./ar.js";
import {scrapeArWinners} from "./winners/ar.js";
import {scrapeCt} from "./ct.js";
import {scrapeOk,parseOkPage} from "./ok.js";
import {feedHealth,reportingDate} from "../../shared/quality.js";
import corrections from "../../data/corrections-v1.json";

afterEach(()=>vi.unstubAllGlobals());
describe("reviewed source access",()=>{
  it("also pauses the Arkansas posted-winner adapter before network access",async()=>{
    const request=vi.fn();vi.stubGlobal("fetch",request);
    await expect(scrapeArWinners()).rejects.toThrow("403");expect(request).not.toHaveBeenCalled();
  });
  it.each([["ar",scrapeAr,"403"],["ct",scrapeCt,"scraping"],["ok",scrapeOk,"authorization"]] as const)("pauses %s before requesting anything",async(state,collect,reason)=>{
    const request=vi.fn();vi.stubGlobal("fetch",request);
    await expect(collect()).rejects.toThrow(reason);expect(request).not.toHaveBeenCalled();
    const health=feedHealth({state,source:"official",generatedAt:"2026-10-05T15:00:00Z"},null,Date.parse("2026-10-05T16:00:00Z"));
    expect(health.eligible).toBe(false);expect(health.reasons.join()).toContain(reason);
  });
});
const page='<div><p>GAME NUMBER</p><p>842</p></div><div><p>PRICE</p><p>$20</p></div><div><p>TOTAL TICKETS IN GAME</p><p>725,040</p></div><table><thead><tr><th>Prize</th><th>Remaining Prizes</th><th>Total Prizes</th></tr></thead><tbody><tr><td>$200,000</td><td>2</td><td>3</td></tr></tbody></table>';
describe("Oklahoma redesigned format (offline only)",()=>{
  it("takes the printed ticket anchor and original/remaining column order",()=>expect(parseOkPage(page,"official","All the Luck")).toMatchObject({gameId:"842",price:20,totalTickets:725040,tiers:[{amount:200000,remaining:2,originalCount:3}]}));
  it("rejects malformed or impossible rows",()=>{
    expect(()=>parseOkPage(page.replace('<td>2</td>','<td>4</td>'),"official","Test")).toThrow();
    expect(()=>parseOkPage(page.replace('Total Prizes','Original'),"official","Test")).toThrow();
  });
});
describe("Nebraska versioned observation",()=>{
  const correction=corrections.corrections.find(c=>c.state==="ne")!;
  it("has all 26 PDF games including the game absent from the HTML catalog",()=>{
    expect(correction.snapshot.games).toHaveLength(26);
    expect(correction.snapshot.games.find(g=>g.gameId==="1335")).toMatchObject({name:"Pocket Change 5X",price:1,topPrizeValue:500});
    expect(new Set(correction.snapshot.games.map(g=>g.gameId)).size).toBe(26);
  });
  it("uses the printed report date and retains actual import time",()=>{
    expect(correction.snapshot).toMatchObject({limited:true,generatedAt:"2026-10-05T15:54:28.275Z",sourceAsOf:"2026-10-04",resultsAsOf:"2026-10-04",dateBasis:"source"});
    expect(feedHealth({...correction.snapshot,dateBasis:"source"},null,Date.parse("2026-10-05T16:00:00Z")).eligible).toBe(true);
  });
  it("does not infer closure from the unrelated 2030 website placeholder",()=>expect(correction.snapshot.games.find(g=>g.gameId==="1357")?.closingSoon).toBe(false));
  it("keeps the requested September 2 to September 1 fallback",()=>expect(reportingDate("2026-09-02T12:00:00Z","ne")).toEqual({resultsAsOf:"2026-09-01",dateBasis:"assumed-previous-day",timeZone:"America/Chicago"}));
});
