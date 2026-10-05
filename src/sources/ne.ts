import * as cheerio from "cheerio";
import { UA } from "./http.js";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fmtDollars } from "./parse.js";
import type { LiteGame } from "../types.js";

export const NE_PDF_URL = "https://m.nelottery.com/images/media/Scratch_Prizes_Remaining.pdf";

/** Legacy HTML parsers retained for old fixtures. Live collection uses the official PDF below. */

/** Parse "$50,000" / "6,849" / "30" -> number, blanks -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,%\s]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Extract the set of game numbers ("1339") listed on the Game Closings page. */
export function parseNeClosing(html: string): Set<string> {
  const $ = cheerio.load(html);
  const ids = new Set<string>();
  $("table a").each((_, a) => {
    const m = /#(\d{3,5})/.exec($(a).text());
    if (m && m[1]) ids.add(m[1]);
  });
  return ids;
}

export function parseNe(html: string, closingIds: Set<string> = new Set()): LiteGame[] {
  const $ = cheerio.load(html);
  const games: LiteGame[] = [];

  $(".gameBlock").each((_, block) => {
    const $b = $(block);
    const price = num($b.find(".ballDollar").first().text());

    const $name = $b.find(".nameBlock");
    const gameId = ($name.find("span").first().text() || "").replace(/[#\s]/g, "").trim();
    // The name is the second span in the nameBlock (after the "#1357" span).
    const name = $name.find("span").eq(1).text().trim();

    if (!Number.isFinite(price) || !gameId || !name) return;

    // Only the top few tiers are published; pair each amount with its remaining count.
    const amounts: number[] = [];
    const remainByAmount: Array<{ amount: number; remaining: number }> = [];
    $b.find(".prizesBlock").each((__, p) => {
      const amount = num($(p).find(".prizeDescriptionBlock").text());
      const remaining = num($(p).find(".prizeCountBlock").text());
      if (Number.isFinite(amount)) {
        amounts.push(amount);
        remainByAmount.push({ amount, remaining });
      }
    });

    const topPrizeValue = amounts.length > 0 ? Math.max(...amounts) : null;
    const topPrize = topPrizeValue !== null ? fmtDollars(topPrizeValue) : "";

    const topTierGone =
      topPrizeValue !== null &&
      remainByAmount
        .filter((r) => r.amount === topPrizeValue)
        .every((r) => Number.isFinite(r.remaining) && r.remaining === 0);
    const closingSoon = closingIds.has(gameId) || topTierGone;

    games.push({ gameId, name, price, topPrize, topPrizeValue, closingSoon });
  });

  return games;
}

/** Execute the checked PDF parser; no shell, dependency installation, or network fallback. */
export async function parseNePdf(bytes: Uint8Array): Promise<{sourceAsOf:string; games:LiteGame[]}> {
  if(bytes.byteLength > 12*1024*1024) throw new Error("NE report exceeds size limit");
  const python=process.env.LOTTERYEDGE_PYTHON || "python";
  return new Promise((resolve,reject)=>{
    const child=spawn(python,[fileURLToPath(new URL("../../scripts/ne-prizes.py",import.meta.url))],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
    let output="",error="",settled=false;
    const fail=(message:string)=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error(message));}};
    const timer=setTimeout(()=>{child.kill();fail("NE PDF parser timed out");},30000);
    child.on("error",()=>fail("NE PDF parser requires LOTTERYEDGE_PYTHON pointing to Python with pdfplumber 0.11.x; no software was installed automatically."));
    child.stdout.on("data",chunk=>{output+=chunk;if(output.length>1000000){child.kill();fail("NE parser output exceeds limit");}});
    child.stderr.on("data",chunk=>{error=(error+chunk).slice(-4000);});
    child.stdin.on("error",()=>{});
    child.on("close",code=>{
      if(settled)return;
      if(code!==0){fail(error || "NE PDF parser failed; check Python/pdfplumber configuration");return;}
      try {
        const parsed=JSON.parse(output);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(parsed.sourceAsOf)||!Array.isArray(parsed.games)||!parsed.games.length)throw new Error("NE invalid parser result");
        clearTimeout(timer);settled=true;resolve(parsed);
      }catch(e){fail(String(e));}
    });
    child.stdin.end(bytes);
  });
}
/** Official top-prizes report is incomplete for EV; never treat it as a full ladder. */
export async function scrapeNe(): Promise<{source:string;sourceAsOf:string;games:LiteGame[]}> {
  const res=await fetch(NE_PDF_URL,{headers:{"User-Agent":UA,Accept:"application/pdf"},signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw new Error("NE PDF request failed: HTTP "+res.status);
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(Buffer.from(bytes.subarray(0,5)).toString()!=="%PDF-")throw new Error("NE source did not return a PDF");
  return {source:NE_PDF_URL,...await parseNePdf(bytes)};
}
