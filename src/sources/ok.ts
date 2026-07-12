import type { RawGame, PrizeTier } from "../types.js";

/**
 * Oklahoma Lottery "Remaining Prizes" page is a Vue app
 * (https://www.lottery.ok.gov/scratchers/remaining-prizes). Its bundle
 * (/client/dist/remainingPrizes.js) fetches the game list from a plain JSON
 * endpoint — no browser required.
 */
const API_URL = "https://www.lottery.ok.gov/scratchers/get";

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
  const res = await fetch(API_URL, {
    headers: {
      "User-Agent": "LotteryEdge/0.1 (personal scratch-off EV tool)",
      Accept: "application/json,text/plain,*/*",
    },
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
