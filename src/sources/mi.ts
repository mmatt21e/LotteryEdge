import type { RawGame, PrizeTier } from "../types.js";

/**
 * Michigan retail scratch-off "prizes remaining" adapter.
 *
 * michiganlottery.com is an Apollo/GraphQL app (endpoint `/api`). Introspection
 * is disabled, but the client bundle reveals two queries that together give the
 * full picture for retail instant games. No CSRF/auth is required for reads.
 *
 * 1. Game lobby — price + overall odds (there is no per-tier odds field):
 *      { getCMSGames(removeHiddenGames: true) {
 *          igtId isInstantGame canBuyInStore
 *          displayedTicketPrice   // "$5.00"
 *          overallOdds            // "1 in 4.13"
 *          name identifier } }
 *
 * 2. Bulk prizes-remaining, one request for every instant game:
 *      { getRetailTopPrizesRemainingByGameType(gameType: "INSTANT") {
 *          cms_game_igt_id game_name
 *          prizesRemainingData {
 *            prize_level prize_amount prizes_remaining starting_amount } } }
 *
 *    Despite the "TopPrizes" name it returns EVERY prize level, with
 *    starting_amount (original count) and prizes_remaining. With no per-tier
 *    odds, `overallOdds` is the EV anchor (MA-style).
 *
 * The two are joined on the game's IGT id.
 */
const API_URL = "https://www.michiganlottery.com/api";

const LOBBY_QUERY = `{
  getCMSGames(removeHiddenGames: true) {
    name
    identifier
    igtId
    isInstantGame
    canBuyInStore
    displayedTicketPrice
    overallOdds
  }
}`;

const PRIZES_QUERY = `{
  getRetailTopPrizesRemainingByGameType(gameType: "INSTANT") {
    cms_game_igt_id
    game_name
    prizesRemainingData {
      prize_level
      prize_amount
      prizes_remaining
      starting_amount
    }
  }
}`;

interface LobbyGame {
  name?: string;
  identifier?: string;
  igtId?: number | null;
  isInstantGame?: boolean;
  canBuyInStore?: boolean;
  displayedTicketPrice?: string;
  overallOdds?: string;
}
interface PrizeRow {
  prize_level?: number;
  prize_amount?: string | number;
  prizes_remaining?: string | number;
  starting_amount?: string | number;
}
interface PrizeGame {
  cms_game_igt_id?: number;
  game_name?: string;
  prizesRemainingData?: PrizeRow[] | null;
}

/** Parse "$5.00" / "500000" -> numeric value, else NaN. */
function num(s: unknown): number {
  const cleaned = String(s ?? "").replace(/[^0-9.]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Parse "1 in 4.13" -> 4.13, else undefined. */
function parseOverallOdds(s: unknown): number | undefined {
  const m = /([\d.]+)\s*$/.exec(String(s ?? "").trim());
  if (!m) return undefined;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "LotteryEdge/0.1 (personal scratch-off EV tool)",
      Accept: "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`POST ${API_URL} -> ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error(`MI GraphQL error: ${JSON.stringify(json.errors).slice(0, 300)}`);
  if (!json.data) throw new Error("MI GraphQL returned no data.");
  return json.data;
}

export function buildMiGames(lobby: LobbyGame[], prizes: PrizeGame[]): RawGame[] {
  // Index price/odds by IGT id from the lobby.
  const meta = new Map<number, { name: string; price: number; overallOdds?: number }>();
  for (const g of lobby) {
    if (g.igtId == null || !g.isInstantGame || !g.canBuyInStore) continue;
    const price = num(g.displayedTicketPrice);
    if (!Number.isFinite(price) || price <= 0) continue;
    meta.set(g.igtId, {
      name: (g.name ?? "").trim(),
      price,
      overallOdds: parseOverallOdds(g.overallOdds),
    });
  }

  const games: RawGame[] = [];
  for (const pg of prizes) {
    const id = pg.cms_game_igt_id;
    if (id == null) continue;
    const m = meta.get(id);
    if (!m) continue; // no price/odds anchor -> can't compute EV, skip

    const tiers: PrizeTier[] = [];
    for (const row of pg.prizesRemainingData ?? []) {
      const amount = num(row.prize_amount);
      const originalCount = num(row.starting_amount);
      if (!Number.isFinite(amount) || !Number.isFinite(originalCount) || originalCount <= 0) continue;
      const rem = num(row.prizes_remaining);
      tiers.push({
        amount,
        originalCount,
        remaining: Number.isFinite(rem) && rem > 0 ? rem : 0,
      });
    }
    if (tiers.length === 0) continue;

    games.push({
      state: "mi",
      gameId: String(id),
      name: m.name || (pg.game_name ?? "").trim(),
      price: m.price,
      url: "https://www.michiganlottery.com/games/instant-games/prizes-remaining",
      tiers,
      overallOdds: m.overallOdds,
    });
  }

  return games;
}

/** Fetch and parse live Michigan retail scratch-off data. */
export async function scrapeMi(): Promise<{ source: string; games: RawGame[] }> {
  const [lobbyData, prizeData] = await Promise.all([
    gql<{ getCMSGames: LobbyGame[] }>(LOBBY_QUERY),
    gql<{ getRetailTopPrizesRemainingByGameType: PrizeGame[] }>(PRIZES_QUERY),
  ]);

  const games = buildMiGames(
    lobbyData.getCMSGames ?? [],
    prizeData.getRetailTopPrizesRemainingByGameType ?? [],
  );
  if (games.length === 0) {
    throw new Error(
      "MI parser found 0 games — the GraphQL query shape may have changed.",
    );
  }
  return { source: API_URL, games };
}
