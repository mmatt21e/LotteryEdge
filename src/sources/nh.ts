import { fetchJson } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

/**
 * New Hampshire Lottery — scratch (instant) game prizes remaining.
 *
 * The nhlottery.com "prizes-remaining" page is a client-rendered SPA, so we
 * talk to the two JSON APIs it calls (discovered in its JS bundle):
 *
 *  1. Game catalog (same-origin, no auth):
 *       https://www.nhlottery.com/api/v1/game/all
 *     -> { data: { games: [ { name, identifier, type:"scratch",
 *          price:{priceInCents}, odds (overall "1 in X"), ticketsOrdered,
 *          configuration.dataServices.gameDataServiceId } ] } }
 *     This is where the EV ANCHOR lives: `odds` is the overall odds and
 *     `ticketsOrdered` is the total print run.
 *
 *  2. Prizes remaining (Gambyt game-data service, needs the public API key
 *     baked into the site bundle):
 *       https://prod.game-data.gambytservices.com/v1/instant-game/prizes-remaining
 *       header  X-API-Key: <GAME_DATA_API_KEY from the site bundle>
 *     -> { prizesRemaining: [ { instantGameId, prizeAmountInDollars,
 *          startingCount, remainingCount, sortOrder } ] }
 *
 * JOIN: game.configuration.dataServices.gameDataServiceId === prize.instantGameId.
 *
 * Neither endpoint publishes per-tier odds, so we anchor EV with the whole-game
 * figures: totalTickets = ticketsOrdered (preferred), else overallOdds = odds.
 */
const CATALOG_URL = "https://www.nhlottery.com/api/v1/game/all";
const PRIZES_URL =
  "https://prod.game-data.gambytservices.com/v1/instant-game/prizes-remaining";
// Public read-only key shipped in the nhlottery.com client bundle (ClientConfig.GAME_DATA_API_KEY).
const GAME_DATA_API_KEY = "1c4c69db-274c-4f59-95c5-3211cd74e9d8";

interface NhCatalogGame {
  name?: string;
  identifier?: string;
  type?: string;
  price?: { priceInCents?: number };
  odds?: number;
  ticketsOrdered?: number;
  configuration?: { dataServices?: { gameDataServiceId?: string } };
}

interface NhPrize {
  instantGameId?: string;
  prizeAmountInDollars?: number;
  startingCount?: number;
  remainingCount?: number;
}

export function parseNh(
  catalog: { data?: { games?: NhCatalogGame[] } },
  prizes: { prizesRemaining?: NhPrize[] },
): RawGame[] {
  // Group prize tiers by the game-data service id.
  const tiersByGame = new Map<string, PrizeTier[]>();
  for (const p of prizes.prizesRemaining ?? []) {
    const id = p.instantGameId;
    const amount = Number(p.prizeAmountInDollars);
    const originalCount = Number(p.startingCount);
    const remaining = Number(p.remainingCount);
    if (!id || !Number.isFinite(amount) || !Number.isFinite(originalCount)) continue;
    const tier: PrizeTier = {
      amount,
      // No per-tier odds published — anchor is whole-game (see below).
      odds: undefined,
      originalCount,
      remaining: Number.isFinite(remaining) ? remaining : 0,
    };
    const arr = tiersByGame.get(id);
    if (arr) arr.push(tier);
    else tiersByGame.set(id, [tier]);
  }

  const games: RawGame[] = [];
  for (const g of catalog.data?.games ?? []) {
    if (g.type !== "scratch") continue; // skip draw / e-Instant games
    const gid = g.configuration?.dataServices?.gameDataServiceId;
    if (!gid) continue;
    const tiers = tiersByGame.get(gid);
    if (!tiers || tiers.length === 0) continue;

    const name = (g.name ?? "").trim();
    const price = Number(g.price?.priceInCents) / 100;
    if (!name || !Number.isFinite(price) || price <= 0) continue;

    const totalTickets =
      Number.isFinite(g.ticketsOrdered) && (g.ticketsOrdered ?? 0) > 0
        ? g.ticketsOrdered
        : undefined;
    const overallOdds =
      Number.isFinite(g.odds) && (g.odds ?? 0) > 0 ? g.odds : undefined;

    games.push({
      state: "nh",
      gameId: gid,
      name,
      price,
      url: g.identifier
        ? `https://www.nhlottery.com/game/${g.identifier}`
        : undefined,
      tiers,
      // EV ANCHOR: prefer the stated print run, fall back to overall odds.
      totalTickets,
      overallOdds,
    });
  }
  return games;
}

/** Fetch and parse live NH scratch-game data. */
export async function scrapeNh(): Promise<{ source: string; games: RawGame[] }> {
  const [catalog, prizes] = await Promise.all([
    fetchJson<{ data?: { games?: NhCatalogGame[] } }>(CATALOG_URL),
    fetchJson<{ prizesRemaining?: NhPrize[] }>(PRIZES_URL, {
      headers: { "X-API-Key": GAME_DATA_API_KEY },
    }),
  ]);
  const games = parseNh(catalog, prizes);
  if (games.length === 0) {
    throw new Error(
      "NH parser found 0 games — the catalog/prizes-remaining API shape may have changed.",
    );
  }
  return { source: PRIZES_URL, games };
}
