import type { RawGame, PrizeTier } from "../types.js";

/**
 * Florida scratch-off "remaining prizes" adapter.
 *
 * The floridalottery.com "Top Remaining Prizes" page is a Vue widget
 * (`cmp-topprizes`) that reads from an Azure API Management gateway. The gateway
 * rejects requests without the `x-partner: web` header the widget sends
 * (otherwise: 401 "Missing header"). One GET returns every active game with its
 * full per-tier prize table AND per-tier odds:
 *
 *   GET https://apim-website-prod-eastus.azure-api.net/scratchgamesapp/getscratchinfo
 *   -> [ { Id, GameName, TicketPrice, OverallOdds, OddsTiers: [
 *            { PrizeAmount:"$5,000,000.00", WinningOdds:"1-in-3000000",
 *              TotalPrizes, PrizesRemaining, PrizesPaid }, ... ] }, ... ]
 *
 * Per-tier odds make this an NC-style source (best EV anchor); OverallOdds is
 * kept as a fallback for tiers that omit odds.
 */
const API_URL =
  "https://apim-website-prod-eastus.azure-api.net/scratchgamesapp/getscratchinfo";
const VIEW_BASE = "https://floridalottery.com/games/scratch-offs/view";

interface FlTier {
  PrizeAmount?: string;
  WinningOdds?: string;
  TotalPrizes?: number;
  PrizesRemaining?: number;
  PrizesPaid?: number;
}
interface FlGame {
  Id?: number;
  GameName?: string;
  TicketPrice?: number | string;
  OverallOdds?: number | string;
  OddsTiers?: FlTier[] | null;
}

/** Parse "$5,000,000.00" / "20" / "  2 of 4 " -> leading numeric value, else NaN. */
function num(s: unknown): number {
  const cleaned = String(s ?? "").replace(/[^0-9.]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Parse "1-in-3000000" / "1-in-3,000" -> 3000000, empty "1-in-" -> undefined. */
function parseOdds(s: unknown): number | undefined {
  const m = /1-in-([\d,.]+)/.exec(String(s ?? ""));
  if (!m) return undefined;
  const v = Number(m[1]!.replace(/,/g, ""));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

export function parseFl(raw: unknown): RawGame[] {
  if (!Array.isArray(raw)) {
    throw new Error("FL: unexpected API payload (expected a JSON array of games).");
  }
  const games: RawGame[] = [];

  for (const g of raw as FlGame[]) {
    const price = num(g.TicketPrice);
    const oddsTiers = g.OddsTiers ?? [];
    const name = (g.GameName ?? "").trim();
    const gameId = g.Id != null ? String(g.Id) : "";
    if (!name || !gameId || !Number.isFinite(price) || price <= 0) continue;
    if (oddsTiers.length === 0) continue;

    // Guard against not-yet-loaded / pre-launch games: their advertised top
    // tier carries TotalPrizes 0 and placeholder odds, which detonates the EV
    // estimate. If the highest-value tier has no original prizes, the game's
    // data is incomplete — skip it rather than publish a garbage ROI.
    const topOriginal = oddsTiers.reduce(
      (best, t) => (num(t.PrizeAmount) > best.amount ? { amount: num(t.PrizeAmount), oc: t.TotalPrizes ?? 0 } : best),
      { amount: -Infinity, oc: 0 },
    );
    if (!(topOriginal.oc > 0)) continue;

    const tiers: PrizeTier[] = [];
    for (const t of oddsTiers) {
      const amount = num(t.PrizeAmount);
      const originalCount = t.TotalPrizes ?? 0;
      if (!Number.isFinite(amount) || originalCount <= 0) continue;
      const rem = t.PrizesRemaining ?? 0;
      tiers.push({
        amount,
        odds: parseOdds(t.WinningOdds),
        originalCount,
        remaining: Number.isFinite(rem) && rem > 0 ? rem : 0,
      });
    }
    if (tiers.length === 0) continue;

    const overallOdds = num(g.OverallOdds);
    games.push({
      state: "fl",
      gameId,
      name,
      price,
      url: `${VIEW_BASE}?id=${gameId}`,
      tiers,
      overallOdds: Number.isFinite(overallOdds) && overallOdds > 0 ? overallOdds : undefined,
    });
  }

  return games;
}

/** Fetch and parse live Florida scratch-off data. */
export async function scrapeFl(): Promise<{ source: string; games: RawGame[] }> {
  const res = await fetch(API_URL, {
    headers: {
      // The APIM gateway requires the partner header the site's widget sends.
      "x-partner": "web",
      "User-Agent": "LotteryEdge/0.1 (personal scratch-off EV tool)",
      Accept: "application/json",
      Origin: "https://floridalottery.com",
      Referer: "https://floridalottery.com/games/scratch-offs/top-remaining-prizes",
    },
  });
  if (!res.ok) throw new Error(`GET ${API_URL} -> ${res.status} ${res.statusText}`);
  const data = await res.json();

  const games = parseFl(data);
  if (games.length === 0) {
    throw new Error(
      "FL parser found 0 games — the getscratchinfo payload shape may have changed.",
    );
  }
  return { source: API_URL, games };
}
