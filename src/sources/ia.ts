import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const REMAIN_URL = "https://ialottery.com/Pages/Games/RemainingPrizes.aspx";
const DETAIL_URL = (g: string) =>
  `https://ialottery.com/Pages/Games-Scratch/ScratchGamesDetail.aspx?g=${g}`;

/** Parse "$20,000" -> 20000, "1,151" -> 1151, "N/A" -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Polite pause between the per-game detail fetches. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RemainTier {
  amount: number;
  originalCount: number;
  remaining: number;
}
interface RemainGame {
  gameId: string;
  name: string;
  price: number;
  tiers: RemainTier[];
}

/**
 * Parse the Iowa "Remaining Prizes" page.
 *
 * One server-rendered table (#RemainPrizes_JS_DATATABLE); each row is a single
 * prize tier for a game, columns:
 *   Game Name (Game Number) | Game Type | Cost | Prize | Claimed | Unclaimed
 * Rows for the same game are contiguous. The page lists only prizes of $50+,
 * and carries no odds — those come from the per-game detail page.
 * We keep only "Scratch" games (Pull-Tab / InstaPlay are excluded).
 */
export function parseIaRemaining(html: string): RemainGame[] {
  const $ = cheerio.load(html);
  const byId = new Map<string, RemainGame>();

  $("#RemainPrizes_JS_DATATABLE tbody tr").each((_, tr) => {
    const cells = $(tr)
      .find("td")
      .map((_, td) => $(td).text().trim())
      .get();
    if (cells.length !== 6) return;
    const [nameCell, gameType, cost, prize, claimed, unclaimed] = cells;
    if ((gameType ?? "").toLowerCase() !== "scratch") return;

    const m = /^(.*?)\s*\((\d+)\)\s*$/.exec(nameCell ?? "");
    if (!m) return;
    const name = m[1]!.trim();
    const gameId = m[2]!;

    const amount = num(prize);
    const claimedN = num(claimed);
    const unclaimedN = num(unclaimed);
    if (!Number.isFinite(amount) || !Number.isFinite(unclaimedN)) return;
    const originalCount =
      (Number.isFinite(claimedN) ? claimedN : 0) + unclaimedN;

    let game = byId.get(gameId);
    if (!game) {
      game = { gameId, name, price: num(cost), tiers: [] };
      byId.set(gameId, game);
    }
    game.tiers.push({ amount, originalCount, remaining: unclaimedN });
  });

  return [...byId.values()].filter((g) => g.tiers.length > 0);
}

/** Per-tier and overall odds from a scratch game detail page (table#Prizes). */
export function parseIaDetailOdds(html: string): {
  overallOdds?: number;
  byAmount: Map<number, number>;
} {
  const $ = cheerio.load(html);
  const byAmount = new Map<number, number>();
  let overallOdds: number | undefined;

  $("#Prizes tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length !== 2) return;
    const label = $(tds[0]).text().trim();
    const oddsMatch = /1\s*in\s*([\d.,]+)/i.exec($(tds[1]).text());
    if (!oddsMatch) return;
    const odds = num(oddsMatch[1]);
    if (!Number.isFinite(odds)) return;
    if (/overall/i.test(label)) {
      overallOdds = odds;
    } else {
      const amount = num(label);
      if (Number.isFinite(amount)) byAmount.set(amount, odds);
    }
  });

  return { overallOdds, byAmount };
}

/**
 * Fetch and parse live Iowa scratch-off data.
 *
 * The Remaining Prizes page carries per-tier remaining counts but no odds, so
 * we enrich each game from its detail page: per-tier odds (matched by prize
 * amount) plus the game's overall odds as a fallback anchor.
 */
export async function scrapeIa(): Promise<{ source: string; games: RawGame[] }> {
  const remainHtml = await fetchText(REMAIN_URL);
  const remainGames = parseIaRemaining(remainHtml);
  if (remainGames.length === 0) {
    throw new Error(
      "Iowa parser found 0 games on the Remaining Prizes page — layout may have changed.",
    );
  }

  const games: RawGame[] = [];
  for (const rg of remainGames) {
    const url = DETAIL_URL(rg.gameId);
    let odds: { overallOdds?: number; byAmount: Map<number, number> } = {
      byAmount: new Map(),
    };
    try {
      odds = parseIaDetailOdds(await fetchText(url));
      await sleep(120);
    } catch {
      // Detail page unavailable — keep the game; it just lacks an anchor.
    }

    const tiers: PrizeTier[] = rg.tiers.map((t) => ({
      amount: t.amount,
      odds: odds.byAmount.get(t.amount),
      originalCount: t.originalCount,
      remaining: t.remaining,
    }));

    games.push({
      state: "ia",
      gameId: rg.gameId,
      name: rg.name,
      price: rg.price,
      url,
      tiers,
      overallOdds: odds.overallOdds,
    });
  }

  return { source: REMAIN_URL, games };
}
