import { assertSourceAccess } from "../../shared/sourceAccess.js";
import type { RawGame, PrizeTier } from "../types.js";
import * as cheerio from "cheerio";
import { UA } from "./http.js";

/**
 * Oklahoma Lottery "Remaining Prizes" page is a Vue app
 * (https://www.lottery.ok.gov/scratchers/remaining-prizes). Its bundle
 * (/client/dist/remainingPrizes.js) fetches the game list from a plain JSON
 * endpoint — no browser required.
 */
const API_URL = "https://www.lottery.ok.gov/scratchers/get";

/** Offline parser for the redesigned public detail format. Live collection stays paused. */
export function parseOkPage(html: string, url: string, name: string): RawGame {
  const $ = cheerio.load(html);
  const field = (label:string):number => {
    const matches=$("p").filter((_,p)=>$(p).text().trim().toUpperCase()===label);
    if(matches.length!==1)throw new Error("OK field missing or ambiguous: "+label);
    const text=matches.first().next("p").text().trim().replace(/[$,]/g,"");
    if(!/^\d+(\.\d+)?$/.test(text))throw new Error("OK invalid field: "+label);
    return Number(text);
  };
  const tables=$("table").filter((_,t)=>$(t).find("th").map((_,th)=>$(th).text().trim()).get().join("|")==="Prize|Remaining Prizes|Total Prizes");
  if(tables.length!==1)throw new Error("OK prize table missing or ambiguous");
  const tiers:PrizeTier[]=[];
  tables.find("tbody tr").each((_,tr)=>{
    const cells=$(tr).find("td").map((_,td)=>$(td).text().trim().replace(/[$,]/g,"")).get();
    if(cells.length!==3||cells.some(c=>!/^\d+$/.test(c)))throw new Error("OK invalid prize row");
    const [amount,remaining,originalCount]=cells.map(Number) as [number,number,number];
    if(amount<=0||remaining>originalCount)throw new Error("OK impossible prize row");
    tiers.push({amount,remaining,originalCount});
  });
  if(!tiers.length||new Set(tiers.map(t=>t.amount)).size!==tiers.length)throw new Error("OK missing or duplicate prizes");
  const gameId=String(field("GAME NUMBER")), price=field("PRICE"),totalTickets=field("TOTAL TICKETS IN GAME");
  if(!name.trim()||price<=0||!Number.isSafeInteger(totalTickets)||totalTickets<=0)throw new Error("OK invalid identity or print count");
  return {state:"ok",gameId,name:name.trim(),price,totalTickets,url,tiers};
}

/** One prize row from the OK feed. */
interface OkPrize {
  PrizeAmount: number;
  PrizeOdds: number; // published as 0 across the feed — unusable as an anchor
  RemainingPrizes: number;
  TotalPrizes: number;
}

interface OkGame {
  GameId: number;
  Name: string;
  Price: number;
  OverallOdds?: string;
  TicketsPrinted: number; // authoritative print run — the EV anchor
  Prizes: OkPrize[] | null;
}

export function parseOk(json: string): RawGame[] {
  const data = JSON.parse(json) as { Games?: OkGame[] };
  const list = data.Games ?? [];
  const games: RawGame[] = [];

  for (const g of list) {
    if (!g.Prizes || g.Prizes.length === 0) continue;

    const tiers: PrizeTier[] = [];
    for (const p of g.Prizes) {
      const amount = Number(p.PrizeAmount);
      const originalCount = Number(p.TotalPrizes);
      const remaining = Number(p.RemainingPrizes);
      if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) continue;
      tiers.push({
        amount,
        odds: p.PrizeOdds > 0 ? p.PrizeOdds : undefined,
        originalCount,
        remaining: Number.isFinite(remaining) ? remaining : 0,
      });
    }
    if (tiers.length === 0) continue;

    // The feed states the exact print run; use it as the whole-game anchor
    // (the per-tier odds field is published as 0 and cannot be used).
    const totalTickets = Number(g.TicketsPrinted);
    if (!Number.isFinite(totalTickets) || totalTickets <= 0) continue;

    games.push({
      state: "ok",
      gameId: String(g.GameId),
      name: (g.Name ?? "").trim(),
      price: Number(g.Price),
      url: "https://www.lottery.ok.gov/scratchers/remaining-prizes",
      tiers,
      totalTickets,
    });
  }

  return games;
}

/** Fetch and parse live OK scratch-off data. */
export async function scrapeOk(): Promise<{ source: string; games: RawGame[] }> {
  assertSourceAccess("ok");
  const res = await fetch(API_URL, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json,text/plain,*/*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`GET ${API_URL} -> ${res.status} ${res.statusText}`);
  const games = parseOk(await res.text());
  if (games.length === 0) {
    throw new Error(
      "OK parser found 0 games — the feed shape may have changed. Inspect /scratchers/get.",
    );
  }
  return { source: API_URL, games };
}
