import type { RawGame, PrizeTier } from "../types.js";

/**
 * Massachusetts State Lottery — instant (scratch) game prizes.
 *
 * Open JSON API (no auth, no odds):
 *   https://www.masslottery.com/api/v1/instant-game-prizes
 * returns an ARRAY of games, each:
 *   { massGameID, gameName, gameIdentifier, startDate, ticketCost,
 *     prizeTiers: [ { tierNumber, prizeAmount, totalPrizes, paidPrizes,
 *                     prizesRemaining, prizeDescription, type } ] }
 *
 * EV ANCHOR: NONE. The endpoint publishes no per-tier odds, no overall
 * odds, and no total-tickets figure. The masslottery.com site is a SPA whose
 * only instant-game API is this prizes endpoint (verified against its JS
 * bundle — the sole instant-game path is `instant-game-prizes`; there is no
 * per-game odds/detail API). MA does not publish odds in machine-readable
 * form, so we emit games with full tiers but leave the anchor unset. EV will
 * therefore be zero for MA until an odds source is found. We do NOT fabricate
 * odds.
 */
const PRIZES_URL = "https://www.masslottery.com/api/v1/instant-game-prizes";

interface MaTier {
  tierNumber: number;
  prizeAmount: number;
  totalPrizes: number;
  paidPrizes: number;
  prizesRemaining: number;
  prizeDescription: string;
  type: string;
}

interface MaGame {
  massGameID: number;
  gameName: string;
  gameIdentifier: string;
  startDate: string;
  ticketCost: number;
  prizeTiers: MaTier[];
}

/** Fetch JSON with a sane timeout, identifying the client and asking for JSON. */
async function fetchJson<T>(url: string, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LotteryEdge/0.1 (personal scratch-off EV tool)",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function parseMa(raw: MaGame[]): RawGame[] {
  const games: RawGame[] = [];
  for (const g of raw) {
    const gameId = String(g.massGameID);
    const name = (g.gameName ?? "").trim();
    const price = Number(g.ticketCost);
    if (!gameId || !name || !Number.isFinite(price)) continue;

    const tiers: PrizeTier[] = [];
    for (const t of g.prizeTiers ?? []) {
      const amount = Number(t.prizeAmount);
      const originalCount = Number(t.totalPrizes);
      const remaining = Number(t.prizesRemaining);
      if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) continue;
      tiers.push({
        amount,
        // No odds published by MA — leave undefined (do not fabricate).
        odds: undefined,
        originalCount,
        remaining: Number.isFinite(remaining) ? remaining : 0,
      });
    }
    if (tiers.length === 0) continue;

    games.push({
      state: "ma",
      gameId,
      name,
      price,
      url: g.gameIdentifier
        ? `https://www.masslottery.com/games/scratch-tickets/${g.gameIdentifier}`
        : undefined,
      tiers,
      // EV ANCHOR unset: MA publishes no odds/overallOdds/totalTickets.
    });
  }
  return games;
}

/** Fetch and parse live MA instant-game data. */
export async function scrapeMa(): Promise<{ source: string; games: RawGame[] }> {
  const raw = await fetchJson<MaGame[]>(PRIZES_URL);
  const games = parseMa(raw);
  if (games.length === 0) {
    throw new Error(
      "MA parser found 0 games — the instant-game-prizes API shape may have changed.",
    );
  }
  return { source: PRIZES_URL, games };
}
