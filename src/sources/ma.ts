import type { RawGame, PrizeTier } from "../types.js";

/**
 * Massachusetts State Lottery — instant (scratch) game prizes.
 *
 * Two open JSON APIs (no auth), joined by game id:
 *
 *   https://www.masslottery.com/api/v1/instant-game-prizes
 *     ARRAY of games, each:
 *       { massGameID, gameName, gameIdentifier, startDate, ticketCost,
 *         prizeTiers: [ { tierNumber, prizeAmount, totalPrizes, paidPrizes,
 *                         prizesRemaining, prizeDescription, type } ] }
 *     -> full per-tier structure (original totalPrizes + prizesRemaining) but
 *        NO odds.
 *
 *   https://www.masslottery.com/api/v1/games?type=instant
 *     ARRAY of game metadata, each: { id, identifier, gameType, price,
 *       odds: "1 in X", ... } for Scratch games. `id` == prizes `massGameID`
 *       (and `identifier` == prizes `gameIdentifier`) — verified: all 133
 *       scratch games join cleanly on both keys.
 *
 * EV ANCHOR: the `odds` field ("Overall Odds: 1 in X" printed on the ticket)
 * from the games endpoint becomes each game's `overallOdds`. Combined with the
 * per-tier original counts from the prizes endpoint, the EV engine estimates
 * the print run as Σ(originalCount) × overallOdds. We do NOT fabricate odds —
 * only games whose overall odds MA actually publishes get an anchor.
 *
 * SOLD-OUT GUARD: MA's prizes feed keeps games long after they are effectively
 * gone (>95% of prizes claimed). For those the "prizes unclaimed ≈ tickets
 * unsold" assumption breaks down — a lone unclaimed jackpot in a near-dead game
 * detonates the per-ticket EV. We drop games with under 5% of prizes remaining;
 * they cannot be meaningfully bought and their EV is an artifact.
 */
const PRIZES_URL = "https://www.masslottery.com/api/v1/instant-game-prizes";
const GAMES_URL = "https://www.masslottery.com/api/v1/games?type=instant";

/** Minimum fraction of a game's prizes still unclaimed to trust its EV. */
const MIN_FRACTION_REMAINING = 0.05;

interface MaGameMeta {
  id: number;
  identifier?: string;
  gameType?: string;
  odds?: string | null;
}

/** Parse MA's overall-odds string "1 in 4.13" -> 4.13 (undefined if absent). */
export function parseOdds(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const m = /1\s*in\s*([\d.]+)/i.exec(s);
  if (!m) return undefined;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

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

/**
 * Join the prizes feed with the odds map keyed by massGameID.
 * @param raw       instant-game-prizes payload (per-tier structure)
 * @param oddsById  massGameID -> overall odds "1 in X" value (X)
 */
export function parseMa(raw: MaGame[], oddsById: Map<number, number> = new Map()): RawGame[] {
  const games: RawGame[] = [];
  for (const g of raw) {
    const gameId = String(g.massGameID);
    const name = (g.gameName ?? "").trim();
    const price = Number(g.ticketCost);
    if (!gameId || !name || !Number.isFinite(price)) continue;

    const tiers: PrizeTier[] = [];
    let origTotal = 0;
    let remTotal = 0;
    for (const t of g.prizeTiers ?? []) {
      const amount = Number(t.prizeAmount);
      const originalCount = Number(t.totalPrizes);
      const remaining = Number(t.prizesRemaining);
      if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) continue;
      const rem = Number.isFinite(remaining) ? remaining : 0;
      tiers.push({
        amount,
        // MA publishes no PER-TIER odds; the anchor is whole-game overallOdds.
        odds: undefined,
        originalCount,
        remaining: rem,
      });
      origTotal += originalCount;
      remTotal += rem;
    }
    if (tiers.length === 0) continue;

    // Skip effectively sold-out games: at <5% of prizes remaining the
    // unclaimed≈unsold proxy is unreliable and EV becomes a lone-jackpot
    // artifact (see SOLD-OUT GUARD above).
    const frac = origTotal > 0 ? remTotal / origTotal : 0;
    if (frac < MIN_FRACTION_REMAINING) continue;

    games.push({
      state: "ma",
      gameId,
      name,
      price,
      url: g.gameIdentifier
        ? `https://www.masslottery.com/games/scratch-tickets/${g.gameIdentifier}`
        : undefined,
      tiers,
      // EV ANCHOR: overall odds from the games endpoint (undefined -> EV 0).
      overallOdds: oddsById.get(g.massGameID),
    });
  }
  return games;
}

/** Build a massGameID -> overall-odds ("1 in X" -> X) map from the games feed. */
export function buildOddsMap(meta: MaGameMeta[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const m of meta) {
    if (!Number.isFinite(m.id)) continue;
    const odds = parseOdds(m.odds);
    if (odds !== undefined) map.set(m.id, odds);
  }
  return map;
}

/** Fetch and parse live MA instant-game data (prizes joined with odds). */
export async function scrapeMa(): Promise<{ source: string; games: RawGame[] }> {
  const [raw, meta] = await Promise.all([
    fetchJson<MaGame[]>(PRIZES_URL),
    // Odds are best-effort: if the games feed fails, games simply get no anchor
    // (EV 0) rather than the whole state failing.
    fetchJson<MaGameMeta[]>(GAMES_URL).catch(() => [] as MaGameMeta[]),
  ]);
  const games = parseMa(raw, buildOddsMap(meta));
  if (games.length === 0) {
    throw new Error(
      "MA parser found 0 games — the instant-game-prizes API shape may have changed.",
    );
  }
  return { source: PRIZES_URL, games };
}
